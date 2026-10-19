import { type MouseEvent, useEffect, useState } from "react"
import { slides } from "./slides"

/** Slides are laid out on a fixed 16:9 stage and scaled to fit the window. */
const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 900

function clamp(index: number): number {
  return Math.min(Math.max(index, 0), slides.length - 1)
}

/** The slide named by the URL hash, which is 1-based so `#3` is the third slide. */
function slideFromHash(): number {
  const n = Number.parseInt(window.location.hash.slice(1), 10)
  return Number.isNaN(n) ? 0 : clamp(n - 1)
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

function useStageScale(): number {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return scale
}

export function Deck() {
  const [index, setIndex] = useState(slideFromHash)
  const scale = useStageScale()

  useEffect(() => {
    window.history.replaceState(null, "", `#${index + 1}`)
  }, [index])

  useEffect(() => {
    const onHashChange = () => setIndex(slideFromHash())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          event.preventDefault()
          setIndex((i) => clamp(i + 1))
          break
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          event.preventDefault()
          setIndex((i) => clamp(i - 1))
          break
        case "Home":
          setIndex(0)
          break
        case "End":
          setIndex(slides.length - 1)
          break
        case "f":
        case "F":
          toggleFullscreen()
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Clicking the left third goes back, anywhere else goes forward. Links keep their own clicks.
  const onClick = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) return
    setIndex((i) => clamp(event.clientX < window.innerWidth / 3 ? i - 1 : i + 1))
  }

  const Slide = slides[index]

  return (
    <div className="viewport" onClick={onClick}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="slide" key={index}>
          <Slide />
        </div>
        <footer className="chrome">
          <span>CSK Hub</span>
          <span>
            {index + 1} / {slides.length}
          </span>
        </footer>
        <div className="progress" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
      </div>
    </div>
  )
}
