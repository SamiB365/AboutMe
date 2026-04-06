(() => {
  const fan = document.querySelector(".cards-fan");
  if (!fan) return;

  const leftArrow = fan.querySelector(".fan-arrow-left");
  const rightArrow = fan.querySelector(".fan-arrow-right");
  const leftSection = document.querySelector(".left");

  const slotClasses = ["card-back-4", "card-back-3", "card-back-2", "card-back-1", "card-front"];
  const cards = Array.from(fan.querySelectorAll(".stack-card"));
  if (cards.length !== 5) return;

  const cardTexts = document.querySelectorAll(".card-text");
  let order = [...cards];

  function syncVideos() {
    order.forEach((card, i) => {
      const v = card.querySelector("video");
      if (!v) return;
      const isFront = i === 4;

      if (isFront) {
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.play().catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }

  function syncText() {
    const activeCardName = order[4].dataset.name;
    cardTexts.forEach((text) => {
      const active = text.dataset.card === activeCardName;
      text.style.display = active ? "block" : "none";

      if (active) {
        text.classList.add("fade-in");
        setTimeout(() => text.classList.remove("fade-in"), 350);
      }
    });
  }

  function applyOrder() {
    order.forEach((card, i) => {
      card.classList.remove("card-back-4", "card-back-3", "card-back-2", "card-back-1", "card-front");
      card.classList.add(slotClasses[i]);
    });
    syncVideos();
    syncText();
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

  function bindSwipe(el) {
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    const THRESHOLD = 35;

    el.addEventListener("pointerdown", (e) => {
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    });

    el.addEventListener("pointerup", (e) => {
      if (!tracking) return;
      tracking = false;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) rotateForward();
        else rotateBackward();
      }
    });

    el.addEventListener("pointercancel", () => {
      tracking = false;
    });
  }

  bindSwipe(fan);
  bindSwipe(leftSection);

  applyOrder();
})();