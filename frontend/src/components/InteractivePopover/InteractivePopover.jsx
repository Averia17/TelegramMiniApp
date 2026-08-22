import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react"
import "./InteractivePopover.css"

export const InteractivePopover = ({children, content, className = "", label = "", placement = "bottom", onlyWhenOverflow = false}) => {
  const [open, setOpen] = useState(false)
  const [overflowing, setOverflowing] = useState(!onlyWhenOverflow)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const contentId = useRef(`interactive-popover-${Math.random().toString(36).slice(2)}`).current

  const close = useCallback(() => setOpen(false), [])
  const measureOverflow = useCallback(() => {
    if (!onlyWhenOverflow) return
    const target = triggerRef.current?.querySelector("[data-popover-overflow-target]") || triggerRef.current
    if (target) setOverflowing(target.scrollWidth > target.clientWidth)
  }, [onlyWhenOverflow])

  useLayoutEffect(() => {
    if (!onlyWhenOverflow) return undefined
    measureOverflow()
    window.addEventListener("resize", measureOverflow)
    if (!window.ResizeObserver || !triggerRef.current) return () => window.removeEventListener("resize", measureOverflow)
    const target = triggerRef.current.querySelector("[data-popover-overflow-target]") || triggerRef.current
    const observer = new window.ResizeObserver(measureOverflow)
    observer.observe(target)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measureOverflow)
    }
  }, [content, measureOverflow, onlyWhenOverflow])

  const isEnabled = !onlyWhenOverflow || overflowing
  useEffect(() => {
    if (!isEnabled) close()
  }, [close, isEnabled])

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = event => {
      if (!rootRef.current?.contains(event.target)) close()
    }
    const closeOnEscape = event => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [close, open])

  const toggle = () => {
    if (isEnabled) setOpen(current => !current)
  }
  const handleKeyDown = event => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    toggle()
  }

  return <div ref={rootRef} className={`interactive-popover interactive-popover--${placement} ${isEnabled ? "is-overflowing" : ""} ${open && isEnabled ? "is-open" : ""} ${className}`.trim()}>
    <div ref={triggerRef} className="interactive-popover__trigger" role={label ? "button" : undefined} tabIndex={label ? 0 : undefined}
      aria-label={label || undefined} aria-expanded={label ? open : undefined} aria-controls={label ? contentId : undefined}
      onClick={toggle} onKeyDown={label ? handleKeyDown : undefined}>
      {children}
    </div>
    <div id={contentId} className="interactive-popover__content" role="tooltip">{content}</div>
  </div>
}
