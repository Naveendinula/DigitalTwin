import AxisViewWidget from './AxisViewWidget'
import EcPanel from './EcPanel'
import HvacFmPanel from './HvacFmPanel'
import KeyboardHints from './KeyboardHints'
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
  axisViewProps
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

      {showSpaceNavigator && <SpaceNavigator {...navigatorProps} />}

      <KeyboardHints />

      <AxisViewWidget {...axisViewProps} />
    </div>
  )
}
