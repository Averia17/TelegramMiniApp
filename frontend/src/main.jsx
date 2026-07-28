import ReactDOM from "react-dom/client"
import App from "./App.jsx"
import {assetRegistry} from "./components/BattleGame/rendering/assets/AssetRegistry.js"
import "./scss/main.scss"

assetRegistry.preloadAll(4)

ReactDOM.createRoot(document.getElementById("root")).render(
  <App/>
)
