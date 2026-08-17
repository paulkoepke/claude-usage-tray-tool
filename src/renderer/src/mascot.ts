export const MASCOT = ['▐▛███▜▌', '▝▜█████▛▘', '▘▘ ▝▝'].join('\n')
export const DEAD_MASCOT = ['▐█████▌', '▝▜X███X▛▘', '▘▘ ▝▝'].join('\n')

export function updateMascot(isDead: boolean): void {
  const mascot = document.getElementById('mascot')
  if (mascot) mascot.textContent = isDead ? DEAD_MASCOT : MASCOT
}
