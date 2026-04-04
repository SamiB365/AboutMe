(() => {
  const fan = document.querySelector(".cards-fan");
  if (!fan) return;

  const leftArrow = fan.querySelector(".fan-arrow-left");
  const rightArrow = fan.querySelector(".fan-arrow-right");

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
    const frontCard = order[4];
    const activeCardName = frontCard.dataset.name;

    cardTexts.forEach((text) => {
      if (text.dataset.card === activeCardName) {
        text.style.display = "block";
        text.classList.add("fade-in");
        setTimeout(() => text.classList.remove("fade-in"), 400);
      } else {
        text.style.display = "none";
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

  let touchStartX = 0;
  fan.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  fan.addEventListener("touchend", (e) => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) rotateForward();
      else rotateBackward();
    }
  }, { passive: true });

  applyOrder();
})();