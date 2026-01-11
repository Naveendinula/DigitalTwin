import appStyles from '../constants/appStyles'

export default function AppHeader({ filename, ifcSchema }) {
  return (
    <header style={appStyles.header}>
      <div style={appStyles.logo}>
        <span style={appStyles.logoText}>Digital twin</span>
      </div>
      <div style={appStyles.headerRight}>
        {filename && (
          <div style={appStyles.fileInfo}>
            <span style={appStyles.fileName}>{filename}</span>
            {ifcSchema && <span style={appStyles.fileSchema}>{ifcSchema}</span>}
          </div>
        )}
      </div>
    </header>
  )
}
