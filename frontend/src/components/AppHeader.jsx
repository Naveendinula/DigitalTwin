import appStyles from '../constants/appStyles'
import ValidationBadge from './ValidationBadge'

export default function AppHeader({ filename, ifcSchema, jobId, onOpenValidationReport }) {
  return (
    <header style={appStyles.header}>
      <div style={appStyles.logo}>
        <span style={appStyles.logoText}>Digital twin</span>
      </div>
      <div style={appStyles.headerRight}>
        {jobId && (
          <ValidationBadge 
            jobId={jobId} 
            onOpenReport={onOpenValidationReport}
          />
        )}
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
