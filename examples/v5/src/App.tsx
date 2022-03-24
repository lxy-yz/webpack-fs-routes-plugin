import React from "react"
import logo from "./logo.svg"
import "./App.css"

import { BrowserRouter } from "react-router-dom"
import { renderRoutes } from "react-router-config"
import routes from "~fs-routes"

console.log("routes", routes)

function App() {
  return (
    <BrowserRouter>
      {renderRoutes(routes)}

      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>
            Edit <code>src/App.tsx</code> and save to reload.
          </p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
        </header>
      </div>
    </BrowserRouter>
  )
}

export default App
