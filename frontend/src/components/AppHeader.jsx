import appStyles from '../constants/appStyles'

export default function AppHeader() {
  return (
    <header style={appStyles.header}>
      <div style={appStyles.logo}>
        <span style={appStyles.logoIcon}>ƒ-^</span>
        <span style={appStyles.logoText}>DIGITAL TWIN</span>
      </div>
    </header>
  )
}
