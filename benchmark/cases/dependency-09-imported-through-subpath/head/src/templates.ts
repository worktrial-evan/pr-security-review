// renders the html pages with mustache, which escapes every interpolated value
import Mustache from 'mustache'
import type { User } from './users'

// the profile page template
const profilePageTemplate =
  '<!doctype html><title>{{name}}</title><h1>{{name}}</h1><p>role: {{role}}</p>'

/**
 * Renders the profile page for a user.
 */
export function renderProfilePage(user: User): string {
  return Mustache.render(profilePageTemplate, user)
}
