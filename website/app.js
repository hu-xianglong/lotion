document.documentElement.classList.add("js");

const menuButton = document.querySelector(".menu-button");
const siteNav = document.querySelector(".site-nav");

menuButton?.addEventListener("click", () => {
  const open = siteNav?.classList.toggle("is-open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
});

siteNav?.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLAnchorElement)) return;
  siteNav.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.setAttribute("aria-label", "Open navigation");
});

const productImage = document.querySelector("#product-image");
const captionTitle = document.querySelector("#product-caption-title");
const captionCopy = document.querySelector("#product-caption-copy");
const viewerTabs = Array.from(document.querySelectorAll(".viewer-tab"));

for (const tab of viewerTabs) {
  tab.addEventListener("click", () => {
    if (!(productImage instanceof HTMLImageElement)) return;

    for (const candidate of viewerTabs) {
      const active = candidate === tab;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-selected", String(active));
    }

    productImage.classList.add("is-changing");
    window.setTimeout(() => {
      productImage.src = tab.dataset.image ?? productImage.src;
      productImage.alt = tab.dataset.alt ?? productImage.alt;
      if (captionTitle) captionTitle.textContent = tab.dataset.title ?? "";
      if (captionCopy) captionCopy.textContent = tab.dataset.copy ?? "";
      productImage.addEventListener("load", () => productImage.classList.remove("is-changing"), { once: true });
    }, 90);
  });
}

const copyButton = document.querySelector(".copy-button");

copyButton?.addEventListener("click", async () => {
  const targetId = copyButton.getAttribute("data-copy-target");
  const target = targetId ? document.getElementById(targetId) : null;
  const value = target?.textContent?.trim() ?? "";
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1600);
  } catch {
    copyButton.textContent = "Select text";
  }
});

const revealTargets = Array.from(document.querySelectorAll(".reveal"));

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

  for (const target of revealTargets) observer.observe(target);
} else {
  for (const target of revealTargets) target.classList.add("is-visible");
}

const year = document.querySelector("#current-year");
if (year) year.textContent = String(new Date().getFullYear());
