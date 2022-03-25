import React from 'react'
import { Link } from 'react-router-dom'

const Component: React.FC = () => {
  return (
    <div>
      <p>blog/index.tsx</p>
      <Link to="/blog/1b234bk12b3">
        id: 1b234bk12b3
      </Link> |
      <Link to="/blog/today">
        today
      </Link> |
      <Link to="/blog/today/xxx">
        not exit
      </Link>
    </div>
  )
}

export default Component
