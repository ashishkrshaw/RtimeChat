import { useState } from 'react'

import './App.css'
import { toast } from 'react-hot-toast';
import JoinCreateChat from './Components/JoinCreateChat';


function App() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <JoinCreateChat />
    </div>  

  );
}

export default App
