// shows a greeting for the name in the page url

// read the name from the query string
const pageUrl = new URL(window.location.href)
const visitorName = pageUrl.searchParams.get('name') ?? 'guest'

// render the greeting into the page
const greetingElement = document.querySelector('#greeting')
if (greetingElement !== null) {
  greetingElement.innerHTML = `<h1>Hello, ${visitorName}</h1>`
}
