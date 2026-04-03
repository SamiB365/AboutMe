(() => {
  const fan = document.querySelector(".cards-fan");
  if (!fan) return;

  const leftArrow = fan.querySelector(".fan-arrow-left");
  const rightArrow = fan.querySelector(".fan-arrow-right");

  const slotClasses = ["card-back-4", "card-back-3", "card-back-2", "card-back-1", "card-front"];
  const cards = Array.from(fan.querySelectorAll(".stack-card"));
  if (cards.length !== 5) return;

  let order = [...cards];

  function syncVideos() {
    order.forEach((card, i) => {
      const v = card.querySelector("video");
      if (!v) return;

      const isFront = i === 4; // slot 1 (card-front)
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

  function applyOrder() {
    order.forEach((card, i) => {
      card.classList.remove("card-back-4", "card-back-3", "card-back-2", "card-back-1", "card-front");
      card.classList.add(slotClasses[i]);
    });
    syncVideos();
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

  applyOrder();
})();