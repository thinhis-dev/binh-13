import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Game from '@/pages/Game'
import Home from '@/pages/Home'
import Lobby from '@/pages/Lobby'
import Result from '@/pages/Result'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<Lobby />} />
        <Route path="/room/:code/game" element={<Game />} />
        <Route path="/room/:code/result" element={<Result />} />
      </Routes>
    </BrowserRouter>
  )
}
