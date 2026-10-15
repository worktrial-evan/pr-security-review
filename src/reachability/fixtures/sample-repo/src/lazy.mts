// fixture: a dynamic import with a string literal and one with a computed specifier
const computedSpecifier = ['computed', 'dynamic'].join('-')

export const loadDynamic = () => import('dynamic-import')
export const loadComputed = () => import(computedSpecifier)
