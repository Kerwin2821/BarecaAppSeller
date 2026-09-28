// Firma manual del target de la app (solo Release): la cuenta Apple no tiene dispositivos registrados y
// la firma automática exige un perfil de desarrollo para el archive. Con el perfil App Store creado por la
// API (ver docs/APP-STORE.md) el archive se firma directo con "Apple Distribution". Los Pods no se tocan.
const { withXcodeProject } = require('expo/config-plugins')

const TEAM_ID = '8VJKP5NFUM'
const PROFILE = 'BARECA Vendedores App Store'

module.exports = function withManualSigning(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const target = project.getFirstTarget()
    const configs = project.pbxXCBuildConfigurationSection()
    const list = project.pbxXCConfigurationList()[target.firstTarget.buildConfigurationList]
    for (const { value } of list.buildConfigurations) {
      const bc = configs[value]
      if (!bc || bc.name !== 'Release') continue
      Object.assign(bc.buildSettings, {
        CODE_SIGN_STYLE: 'Manual',
        DEVELOPMENT_TEAM: TEAM_ID,
        CODE_SIGN_IDENTITY: '"Apple Distribution"',
        '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': '"Apple Distribution"',
        PROVISIONING_PROFILE_SPECIFIER: `"${PROFILE}"`,
      })
    }
    return cfg
  })
}
