const surface = container.querySelector('.panel-surface');
if (!surface) {
  return;
}

const setTilt = (xDeg, yDeg) => {
  surface.style.setProperty('--panel-tilt-x', `${xDeg}deg`);
  surface.style.setProperty('--panel-tilt-y', `${yDeg}deg`);
};

const resetTilt = () => setTilt(0, 0);

const handleMove = (event) => {
  const rect = surface.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  const tiltX = Math.max(-6, Math.min(6, -y * 12));
  const tiltY = Math.max(-6, Math.min(6, x * 12));
  setTilt(parseFloat(tiltX.toFixed(2)), parseFloat(tiltY.toFixed(2)));
};

surface.addEventListener('pointermove', handleMove);
surface.addEventListener('pointerleave', resetTilt);
surface.addEventListener('pointerup', resetTilt);
surface.addEventListener('pointercancel', resetTilt);

return () => {
  surface.removeEventListener('pointermove', handleMove);
  surface.removeEventListener('pointerleave', resetTilt);
  surface.removeEventListener('pointerup', resetTilt);
  surface.removeEventListener('pointercancel', resetTilt);
  resetTilt();
};
