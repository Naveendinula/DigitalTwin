import appStyles from '../constants/appStyles'

export default function AppHeader({ filename, ifcSchema }) {
  return (
    <header style={appStyles.header}>
      <div style={appStyles.logo}>
        <span style={appStyles.logoIcon}>ƒ-^</span>
        <span style={appStyles.logoText}>DIGITAL TWIN</span>
      </div>
      {filename && (
        <div style={appStyles.fileInfo}>
          <span style={appStyles.fileName}>{filename}</span>
          {ifcSchema && <span style={appStyles.fileSchema}>{ifcSchema}</span>}
        </div>
      )}
    </header>
  )
}
