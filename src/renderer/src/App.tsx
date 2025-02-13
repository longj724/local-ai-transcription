import { Button } from './components/ui/button'
// import Versions from './components/Versions'

function App(): JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div>
      <Button>Test</Button>
    </div>
  )
}

export default App
