(() => {
  const fan = document.querySelector(".cards-fan");
  if (!fan) return;

  const cards = Array.from(fan.querySelectorAll(".stack-card"));
  if (cards.length !== 5) return;

  const leftArrow = fan.querySelector(".fan-arrow-left");
  const rightArrow = fan.querySelector(".fan-arrow-right");

  const slotClasses = ["card-back-4", "card-back-3", "card-back-2", "card-back-1", "card-front"];
  let order = [...cards];

  function applyOrder() {
    order.forEach((card, i) => {
      card.classList.remove("card-back-4", "card-back-3", "card-back-2", "card-back-1", "card-front");
      card.classList.add(slotClasses[i]);
    });
  }

  function rotateForward() {
    order.unshift(order.pop());
    applyOrder();
  }

  function rotateBackward() {
    order.push(order.shift());
    applyOrder();
  }

  rightArrow?.addEventListener("click", (e) => {
    e.stopPropagation();
    rotateForward();
  });

  leftArrow?.addEventListener("click", (e) => {
    e.stopPropagation();
    rotateBackward();
  });

  const frontCard = () => order[4];

  let startX = 0;
  let startY = 0;
  let tracking = false;
  const SWIPE_THRESHOLD = 28;

  fan.addEventListener("pointerdown", (e) => {
    if (!frontCard().contains(e.target)) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  fan.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) rotateForward();
      else rotateBackward();
    }
  });

  fan.addEventListener("pointercancel", () => {
    tracking = false;
  });

  applyOrder();
})();