"""Test script for IDS validation."""
import logging
import ifcopenshell
import ifctester
import ifctester.ids
import os

logger = logging.getLogger(__name__)
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

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

logger.info('Loading IFC...')
ifc_model = ifcopenshell.open('test_temp.ifc')
logger.info(f'IFC loaded: {ifc_model}')
logger.info(f'Walls in IFC: {ifc_model.by_type("IfcWall")}')

logger.info('\nLoading IDS...')
ids_obj = ifctester.ids.open('test_temp.ids')
logger.info(f'IDS loaded: {ids_obj}')

logger.info('\nValidating...')
try:
    ids_obj.validate(ifc_model)
    logger.info('Validation completed!')
except Exception as e:
    logger.error(f'Validation error: {e}')
    import traceback
    traceback.print_exc()

logger.info('\nResults:')
for spec in ids_obj.specifications:
    logger.info(f'  Spec: {spec.name}')
    logger.info(f'  Status: {spec.status}')
    if hasattr(spec, 'applicable_entities'):
        logger.info(f'  Applicable entities: {len(spec.applicable_entities)}')
        for entity in spec.applicable_entities:
            logger.info(f'    - {entity}')
    logger.info("")

# Cleanup
os.remove('test_temp.ifc')
os.remove('test_temp.ids')
