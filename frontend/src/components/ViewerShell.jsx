import AxisViewWidget from './AxisViewWidget'
import EcPanel from './EcPanel'
import HvacFmPanel from './HvacFmPanel'
import KeyboardHints from './KeyboardHints'
import OccupancyLegend from './OccupancyLegend'
import OccupancyPanel from './OccupancyPanel'
import SectionPlaneHelper from './SectionPlaneHelper'
import SectionPlanePanel from './SectionPlanePanel'
import SelectableModel from './SelectableModelWithVisibility'
import SpaceBboxOverlay from './SpaceBboxOverlay'
import SpaceNavigator from './SpaceNavigator'
import UploadPanel from './UploadPanel'
import Viewer from './Viewer'
import ViewerToolbar from './ViewerToolbar'

export default function ViewerShell({
  containerStyle,
  viewerToolbarProps,
  sectionPanelProps,
  viewerProps,
  sectionPlaneHelperProps,
  selectableModelProps,
  spaceOverlayProps,
  uploadPanelProps,
  ecPanelProps,
  hvacPanelProps,
  spaceNavigatorProps,
  axisViewProps,
  occupancyLegendProps,
  occupancyPanelProps
}) {
  const { visible: showSpaceNavigator, ...navigatorProps } = spaceNavigatorProps || {}

  return (
    <div style={containerStyle}>
      <ViewerToolbar {...viewerToolbarProps} />

      <SectionPlanePanel {...sectionPanelProps} />

      <Viewer {...viewerProps}>
        <SectionPlaneHelper {...sectionPlaneHelperProps} />
        <SelectableModel {...selectableModelProps} />
        <SpaceBboxOverlay {...spaceOverlayProps} />
      </Viewer>

      <UploadPanel {...uploadPanelProps} />

      <EcPanel {...ecPanelProps} />
      <HvacFmPanel {...hvacPanelProps} />
      <OccupancyPanel {...occupancyPanelProps} />

      {showSpaceNavigator && <SpaceNavigator {...navigatorProps} />}

      <OccupancyLegend {...occupancyLegendProps} />

      <KeyboardHints />

      <AxisViewWidget {...axisViewProps} />
    </div>
  )
}
