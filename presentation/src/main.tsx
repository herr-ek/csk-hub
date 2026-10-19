import { createRoot } from "react-dom/client"
import { Deck } from "./Deck"

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(<Deck />)
