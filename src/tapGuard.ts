// Some mobile browsers (notably iOS, and installed web apps) fire a click when
// a scroll gesture ends on top of a poster, which opens it by accident. This
// swallows clicks that come from a touch that moved or from a scroll that was
// still settling, so only real taps reach the app.

const TAP_SLOP_PX = 10
const SCROLL_SETTLE_MS = 120
const TOUCH_CLICK_WINDOW_MS = 800

export function installTapGuard() {
  let startX = 0
  let startY = 0
  let moved = false
  let lastTouchEndAt = 0
  let lastScrollAt = 0

  window.addEventListener('touchstart', (event) => {
    const touch = event.touches[0]
    startX = touch?.clientX ?? 0
    startY = touch?.clientY ?? 0
    moved = false
  }, { capture: true, passive: true })

  window.addEventListener('touchmove', (event) => {
    const touch = event.touches[0]
    if (touch && Math.hypot(touch.clientX - startX, touch.clientY - startY) > TAP_SLOP_PX) {
      moved = true
    }
  }, { capture: true, passive: true })

  window.addEventListener('touchend', () => {
    lastTouchEndAt = Date.now()
  }, { capture: true, passive: true })

  // Scroll events don't bubble, so listen in the capture phase to see every
  // scroll container (page, carousels, episode lists).
  document.addEventListener('scroll', () => {
    lastScrollAt = Date.now()
  }, { capture: true, passive: true })

  window.addEventListener('click', (event) => {
    const now = Date.now()
    if (now - lastTouchEndAt > TOUCH_CLICK_WINDOW_MS) {
      return
    }
    if (moved || now - lastScrollAt < SCROLL_SETTLE_MS) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, { capture: true })
}
