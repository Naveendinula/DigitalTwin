from typing import List, Dict, Any, Optional
from ifcopenshell.util import element as ifc_element

# -----------------------------------------------------------------------------
# Material classification
# -----------------------------------------------------------------------------
MATERIAL_CLASSES = {
    "Aggregates and Sand": ["aggregate", "sand", "gravel"],
    "Aluminium": ["aluminium", "aluminum"],
    "Asphalt": ["asphalt"],
    "Bitumen": ["bitumen"],
    "Brass": ["brass"],
    "Bricks": ["brick", "bricks"],
    "Bronze": ["bronze"],
    "Carpet": ["carpet"],
    "Cement and Mortar": ["cement", "mortar", "grout"],
    "Ceramics": ["ceramic", "tile"],
    "Clay": ["clay", "terracotta"],
    "Concrete": ["concrete"],
    "Copper": ["copper"],
    "Glass": ["glass", "glazing"],
    "Insulation": ["insulation", "insul", "xps", "eps", "mineral wool", "rockwool"],
    "Iron": ["iron", "wrought iron", "cast iron"],
    "Lead": ["lead"],
    "Lime": ["lime"],
    "Linoleum": ["linoleum"],
    "Miscellaneous": ["misc"],
    "Paint": ["paint", "coating"],
    "Paper": ["paper", "cardboard"],
    "Plaster": ["plaster", "gypsum", "gypboard", "drywall"],
    "Plastics": ["plastic", "poly", "pvc", "hdpe", "ldpe", "acrylic"],
    "Rubber": ["rubber", "neoprene", "epdm"],
    "Sealants and Adhesives": ["sealant", "adhesive", "mastic"],
    "Soil": ["soil", "earth"],
    "Steel": ["steel", "metal stud", "metal-stud"],
    "Stone": ["stone", "granite", "marble", "limestone", "slate"],
    "Timber": ["timber", "wood", "plywood", "osb", "lumber"],
    "Tin": ["tin"],
    "Titanium": ["titanium"],
    "Vinyl": ["vinyl", "vct"],
    "Zinc": ["zinc"],
}


def classify_material(raw_name: Optional[str]) -> Optional[str]:
    """Map a raw IFC material name to one of the high-level material classes."""
    if not raw_name:
        return None
    name = raw_name.lower().strip()

    # Optional: strip generic "cladding" noise
    for generic in ["clad", "cladding"]:
        name = name.replace(generic, "")
    name = name.strip()

    for cls, keywords in MATERIAL_CLASSES.items():
        for kw in keywords:
            if kw in name:
                return cls

    return "Miscellaneous"


def is_void_layer(material_name: str) -> bool:
    """
    Return True if the material name suggests a void/air/gap layer
    that should not contribute to embodied carbon or volume share.
    """
    if not material_name:
        return False
    
    name_lower = material_name.lower()
    void_keywords = [
        "air", "vapor", "vapour", "damp", "membrane", 
        "retarder", "void", "cavity"
    ]
    
    for kw in void_keywords:
        if kw in name_lower:
            return True
    return False


# -----------------------------------------------------------------------------
# Material extraction helpers
# -----------------------------------------------------------------------------
def _extract_material_names_from_relating(relating) -> list[str]:
    """Handle different IfcMaterial* constructs and return a list of names."""
    names: List[str] = []

    if relating is None:
        return names

    try:
        if relating.is_a("IfcMaterial"):
            if relating.Name:
                names.append(relating.Name)

        elif relating.is_a("IfcMaterialLayerSetUsage"):
            mls = getattr(relating, "ForLayerSet", None)
            if mls:
                names.extend(_extract_material_names_from_relating(mls))

        elif relating.is_a("IfcMaterialLayerSet"):
            for layer in getattr(relating, "MaterialLayers", []) or []:
                mat = getattr(layer, "Material", None)
                if mat is not None and mat.Name:
                    names.append(mat.Name)

        elif relating.is_a("IfcMaterialConstituentSet"):
            for c in getattr(relating, "MaterialConstituents", []) or []:
                mat = getattr(c, "Material", None)
                if mat is not None and mat.Name:
                    names.append(mat.Name)

        elif relating.is_a("IfcMaterialList"):
            for m in getattr(relating, "Materials", []) or []:
                if m is not None and m.Name:
                    names.append(m.Name)

        elif relating.is_a("IfcMaterialProfileSetUsage"):
            mps = getattr(relating, "ForProfileSet", None)
            if mps:
                mat = getattr(mps, "Material", None)
                if mat is not None and mat.Name:
                    names.append(mat.Name)
                for prof in getattr(mps, "MaterialProfiles", []) or []:
                    mat2 = getattr(prof, "Material", None)
                    if mat2 is not None and mat2.Name:
                        names.append(mat2.Name)
    except AttributeError:
        pass

    # Remove duplicates, keep order
    seen = set()
    unique: List[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    return unique


def get_element_material_names(element) -> list[str]:
    """
    Collect material names for a single element.
    Looks at:
      - Direct IfcRelAssociatesMaterial on the element
      - Materials on its type (IfcRelDefinesByType → RelatingType)
    """
    material_names: set[str] = set()

    # Direct associations
    for rel in (getattr(element, "HasAssociations", []) or []):
        if rel.is_a("IfcRelAssociatesMaterial"):
            material_names.update(
                _extract_material_names_from_relating(rel.RelatingMaterial)
            )

    # Type-based associations
    for rel in (getattr(element, "IsTypedBy", []) or []):
        type_obj = getattr(rel, "RelatingType", None)
        if not type_obj:
            continue
        for rel2 in (getattr(type_obj, "HasAssociations", []) or []):
            if rel2.is_a("IfcRelAssociatesMaterial"):
                material_names.update(
                    _extract_material_names_from_relating(rel2.RelatingMaterial)
                )

    return sorted(material_names)


def has_material(el) -> bool:
    """True if the element (or its type) has any material association."""
    mats = ifc_element.get_materials(el, should_inherit=True)
    return bool(mats)


def get_material_layers_with_shares(el) -> list[Dict[str, Any]]:
    """
    Returns a list of dicts with:
      - name: material name
      - thickness: layer thickness (IFC length units, e.g. mm from Revit)
      - share: thickness / total_non_void_thickness (ignoring air gaps)

    Only handles layered materials (IfcMaterialLayerSetUsage / IfcMaterialLayerSet).
    For non-layered materials, an empty list is returned; the caller can fall back
    to simple material name lists.
    """
    assoc = ifc_element.get_material(el, should_inherit=True)
    layers: List[Dict[str, Any]] = []

    if not assoc:
        return layers

    # IfcMaterialLayerSetUsage -> ForLayerSet -> MaterialLayers
    if assoc.is_a("IfcMaterialLayerSetUsage"):
        mls = assoc.ForLayerSet
    elif assoc.is_a("IfcMaterialLayerSet"):
        mls = assoc
    else:
        return layers  # not a layered material

    material_layers = getattr(mls, "MaterialLayers", []) or []
    
    # Calculate total thickness of NON-VOID layers only
    total_non_void_thickness = 0.0
    for l in material_layers:
        mat = l.Material
        name = mat.Name if (mat and mat.Name) else ""
        if not is_void_layer(name):
            total_non_void_thickness += (l.LayerThickness or 0.0)

    for l in material_layers:
        t = (l.LayerThickness or 0.0)
        mat = l.Material
        name = mat.Name if (mat and mat.Name) else ""
        
        # If void layer, share is 0. If non-void, share is t / total_non_void
        if is_void_layer(name):
            share = 0.0
        else:
            share = t / total_non_void_thickness if total_non_void_thickness > 0 else 0.0
            
        layers.append({"name": name, "thickness": t, "share": share})

    return layers
