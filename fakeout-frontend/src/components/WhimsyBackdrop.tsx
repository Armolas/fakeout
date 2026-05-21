/** Floating doodles behind every screen — pure decoration, no interaction */
export function WhimsyBackdrop() {
  return (
    <div className="whimsy-backdrop" aria-hidden="true">
      <span className="whimsy-float whimsy-float--1">✦</span>
      <span className="whimsy-float whimsy-float--2">☁</span>
      <span className="whimsy-float whimsy-float--3">★</span>
      <span className="whimsy-float whimsy-float--4">◆</span>
      <span className="whimsy-float whimsy-float--5">☁</span>
      <span className="whimsy-float whimsy-float--6">✧</span>
      <span className="whimsy-blob whimsy-blob--1" />
      <span className="whimsy-blob whimsy-blob--2" />
      <span className="whimsy-blob whimsy-blob--3" />
    </div>
  )
}
