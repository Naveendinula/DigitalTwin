from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import ifcopenshell

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from graph_builder import build_graph_from_ifc_model, save_graph
from graph_store_neo4j import _load_graph_rows, _normalize_node


class GraphPhase1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_path = BACKEND_DIR / "tests" / "fixtures" / "graph_phase1.ifc"

    def test_fixture_builds_phase1_graph_shape(self):
        model = ifcopenshell.open(str(self.fixture_path))
        graph = build_graph_from_ifc_model(model)

        nodes = {node_id: attrs for node_id, attrs in graph.nodes(data=True)}
        edge_types = {attrs.get("type") for _, _, attrs in graph.edges(data=True)}

        self.assertTrue({"CONTAINED_IN", "IN_SYSTEM", "HAS_PROPERTY"}.issubset(edge_types))
        self.assertEqual(edge_types - {"CONTAINED_IN", "IN_SYSTEM", "HAS_PROPERTY"}, set())

        ahu_1 = next(attrs for attrs in nodes.values() if attrs.get("name") == "AHU-1")
        ahu_2 = next(attrs for attrs in nodes.values() if attrs.get("name") == "AHU-2")
        terminal = next(attrs for attrs in nodes.values() if attrs.get("name") == "Supply Terminal 1")
        space = next(attrs for attrs in nodes.values() if attrs.get("ifcType") == "IfcSpace")
        storey = next(attrs for attrs in nodes.values() if attrs.get("ifcType") == "IfcBuildingStorey")
        system = next(attrs for attrs in nodes.values() if attrs.get("ifcType") == "IfcSystem")

        self.assertEqual(ahu_1.get("graphRole"), "equipment")
        self.assertEqual(ahu_1.get("mark"), None)
        self.assertEqual(ahu_1.get("description"), "Primary air handling unit")
        self.assertEqual(ahu_1.get("storey"), "L5")

        self.assertEqual(ahu_2.get("graphRole"), "equipment")
        self.assertEqual(ahu_2.get("mark"), "EQ-2")
        self.assertEqual(ahu_2.get("description"), None)
        self.assertEqual(ahu_2.get("storey"), "L5")

        self.assertEqual(terminal.get("graphRole"), "terminal")
        self.assertEqual(space.get("graphRole"), "space")
        self.assertEqual(storey.get("graphRole"), "storey")
        self.assertEqual(system.get("graphRole"), "system")

    def test_graph_json_rows_preserve_phase1_node_fields(self):
        model = ifcopenshell.open(str(self.fixture_path))
        graph = build_graph_from_ifc_model(model)

        with tempfile.TemporaryDirectory() as tmp_dir:
            graph_path = Path(tmp_dir) / "graph.json"
            save_graph(graph, graph_path)

            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            raw_ahu_2 = next(
                node for node in payload["nodes"]
                if node.get("name") == "AHU-2" and node.get("ifcType") == "IfcBuildingElementProxy"
            )
            normalized = _normalize_node(raw_ahu_2)
            nodes, edges, prop_rows = _load_graph_rows(graph_path)

        self.assertIsNotNone(normalized)
        self.assertEqual(normalized["graphRole"], "equipment")
        self.assertEqual(normalized["mark"], "EQ-2")
        self.assertEqual(normalized["description"], None)
        self.assertEqual(normalized["storey"], "L5")

        edge_types = {edge["type"] for edge in edges}
        self.assertEqual(edge_types - {"CONTAINED_IN", "IN_SYSTEM"}, set())
        self.assertTrue(any(node["graphRole"] == "equipment" for node in nodes))
        self.assertTrue(any(row["parentId"] and row["propName"] for row in prop_rows))


if __name__ == "__main__":
    unittest.main()
