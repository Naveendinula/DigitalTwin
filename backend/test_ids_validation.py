"""Test script for IDS validation."""
import ifcopenshell
import ifctester
import ifctester.ids
import os

# Create a minimal IFC file
ifc_content = '''ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('','2022-10-07T13:48:44',(),(),'IfcOpenShell v0.7.0-dc67287d','IfcOpenShell v0.7.0-dc67287d','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,$,$,$,$,$,$,$);
#2=IFCWALL('0eA6m4fELI9QBIhP3wiLAp',$,'Waldo',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;'''

# Write temp IFC
with open('test_temp.ifc', 'w') as f:
    f.write(ifc_content)

# Create IDS content
ids_content = '''<?xml version="1.0" encoding="utf-8"?>
<ids xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd" xmlns="http://standards.buildingsmart.org/IDS">
  <info>
    <title>Test IDS</title>
  </info>
  <specifications>
    <specification name="Wall Name Check" ifcVersion="IFC4">
      <applicability minOccurs="0" maxOccurs="unbounded">
        <entity>
          <name>
            <simpleValue>IFCWALL</simpleValue>
          </name>
        </entity>
      </applicability>
      <requirements>
        <attribute>
          <name>
            <simpleValue>Name</simpleValue>
          </name>
          <value>
            <simpleValue>Waldo</simpleValue>
          </value>
        </attribute>
      </requirements>
    </specification>
  </specifications>
</ids>'''

with open('test_temp.ids', 'w') as f:
    f.write(ids_content)

print('Loading IFC...')
ifc_model = ifcopenshell.open('test_temp.ifc')
print(f'IFC loaded: {ifc_model}')
print(f'Walls in IFC: {ifc_model.by_type("IfcWall")}')

print('\nLoading IDS...')
ids_obj = ifctester.ids.open('test_temp.ids')
print(f'IDS loaded: {ids_obj}')

print('\nValidating...')
try:
    ids_obj.validate(ifc_model)
    print('Validation completed!')
except Exception as e:
    print(f'Validation error: {e}')
    import traceback
    traceback.print_exc()

print('\nResults:')
for spec in ids_obj.specifications:
    print(f'  Spec: {spec.name}')
    print(f'  Status: {spec.status}')
    if hasattr(spec, 'applicable_entities'):
        print(f'  Applicable entities: {len(spec.applicable_entities)}')
        for entity in spec.applicable_entities:
            print(f'    - {entity}')
    print()

# Cleanup
os.remove('test_temp.ifc')
os.remove('test_temp.ids')
