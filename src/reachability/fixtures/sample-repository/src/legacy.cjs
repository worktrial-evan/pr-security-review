// fixture: require with a string literal, with a template literal and with a computed argument
const leftPad = require('left-pad')
const templatePackage = require(`template-require`)
const computedName = ['computed', 'require'].join('-')
const computedPackage = require(computedName)

module.exports = { leftPad, templatePackage, computedPackage }
