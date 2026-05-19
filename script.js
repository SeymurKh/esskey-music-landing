/* ═══════════════════════════════════════════════════════════════════════════
   EssKeyMusic — Landing Page Script
   ═══════════════════════════════════════════════════════════════════════════

   Structure:
     1. Config
     2. DOM References
     3. Utility Functions
     4. Data Fetching (YouTube API v3 — single request)
     5. Rendering (cards, skeletons, show-more)
     6. Scroll Reveal Animation
     7. Background Video Fallback
     8. Featured YouTube Player
     9. Contact Form
    10. Preloader
    11. Parallax
    12. Bootstrap (entry point)
   ═══════════════════════════════════════════════════════════════════════════ */


/* ─── 1. Config ─────────────────────────────────────────────────────────── */

const CONFIG = {
  CHANNEL_ID: "UCa9kWM8BbmFi5OpXbjyqk9w",

  // YouTube Data API v3 Key
  // ⚠️ SECURITY: Restrict this key in Google Cloud Console:
  //    - Go to: https://console.cloud.google.com/apis/credentials
  //    - Edit this key → Application restrictions: HTTP referrers
  //    - Add: https://esskey-music.vercel.app/*
  YOUTUBE_API_KEY: "AIzaSyBF1CMRH89borC-ibFL3LXX_7XofUJLEuY",

  VISIBLE_VIDEO_COUNT: 6,
  MAX_VIDEOS: 50,
  PRELOADER_MAX_TIME: 8000,
  PARALLAX_FACTOR: 0.03,
};

/** Title patterns that identify 24/7 live streams */
const STREAM_TITLE_PATTERNS = [
  "RADIO 24/7", "24/7 RADIO", "LIVE RADIO", "24/7 STREAM",
];


/* ─── 2. DOM References ────────────────────────────────────────────────── */

const $videoList    = document.getElementById("videoList");
const $videoFlyout  = document.getElementById("videoFlyout");
const $liveList     = document.getElementById("liveList");
const $liveFlyout   = document.getElementById("liveFlyout");
const $preloader    = document.getElementById("preloader");
const $preloaderBar = document.getElementById("preloaderBar");
const $preloaderPct = document.getElementById("preloaderPercent");


/* ─── 3. Utility Functions ─────────────────────────────────────────────── */

/** Validate email address with stricter regex */
function isValidEmail(email) {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

/** Build a YouTube thumbnail URL from a video ID */
function coverUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Validate that a string is a safe HTTP(S) URL to prevent XSS */
function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Check if a video title matches known stream patterns */
function isStreamByTitle(title) {
  const upperTitle = (title || "").toUpperCase();
  for (const pattern of STREAM_TITLE_PATTERNS) {
    if (upperTitle.startsWith(pattern)) return true;
  }
  return false;
}


/* ─── 4. Data Fetching (YouTube API v3 — single request) ───────────────── */

/**
 * Fetch all uploads using YouTube Data API v3.
 * Single request to playlistItems — returns raw items for later separation.
 */
async function fetchViaYouTubeAPI() {
  const uploadsPlaylistId = CONFIG.CHANNEL_ID.replace("UC", "UU");

  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(CONFIG.MAX_VIDEOS));
  url.searchParams.set("key", CONFIG.YOUTUBE_API_KEY);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);

  try {
    const res = await fetch(url.toString(), { signal: ctl.signal });
    clearTimeout(timer);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${res.status}`;

      if (res.status === 403 && errorMsg.includes("quota")) {
        throw new Error("YouTube API quota exceeded");
      }

      throw new Error(`YouTube API error: ${errorMsg}`);
    }

    const data = await res.json();

    if (!data.items || !data.items.length) {
      throw new Error("No videos found in API response");
    }

    const items = data.items
      .filter(item => item.snippet?.resourceId?.videoId)
      .map(item => {
        const videoId = item.snippet.resourceId.videoId;
        const title = item.snippet.title || "Untitled";

        if (title === "Private video" || title === "Deleted video") {
          return null;
        }

        return {
          id: videoId,
          title: title,
          url: `https://youtu.be/${videoId}`,
          thumbnail: item.snippet.thumbnails?.high?.url ||
                     item.snippet.thumbnails?.medium?.url ||
                     coverUrl(videoId),
          published: item.contentDetails?.videoPublishedAt ||
                     item.snippet.publishedAt || "",
          liveBroadcastContent: item.snippet.liveBroadcastContent || "none",
        };
      })
      .filter(Boolean);

    console.log(`[EssKey] YouTube API: fetched ${items.length} items`);
    return items;

  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("YouTube API timeout after 10000ms");
    }
    throw err;
  }
}

/**
 * Fetch and separate videos from streams.
 * Strategy:
 *  1. Try YouTube Data API v3 (single playlistItems request)
 *  2. Separate result into { videos, streams } by liveBroadcastContent + title patterns
 *  3. Sort each array by date (newest first)
 */
async function fetchYouTubeVideos() {
  const items = await fetchViaYouTubeAPI();

  const videos = [];
  const streams = [];

  for (const item of items) {
    const isLive = item.liveBroadcastContent === "live" || item.liveBroadcastContent === "upcoming";
    const isStreamTitle = isStreamByTitle(item.title);

    if (isLive || isStreamTitle) {
      streams.push(item);
    } else {
      videos.push(item);
    }
  }

  // Sort by published date (newest first)
  const sortByDate = (a, b) => {
    const dateA = a.published ? new Date(a.published).getTime() : 0;
    const dateB = b.published ? new Date(b.published).getTime() : 0;
    return dateB - dateA;
  };

  videos.sort(sortByDate);
  streams.sort(sortByDate);

  console.log(`[EssKey] Separated: ${videos.length} videos, ${streams.length} streams`);

  return { videos, streams };
}


/* ─── 5. Rendering ─────────────────────────────────────────────────────── */

function renderSkeletons(container, count) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "skeleton-card";
    container.appendChild(el);
  }
}

function clearSkeletons(container) {
  container.querySelectorAll(".skeleton-card").forEach((s) => s.remove());
}

function renderErrorState(container, errorMsg) {
  container.innerHTML = "";

  const errorWrapper = document.createElement("div");
  errorWrapper.className = "error-state";
  errorWrapper.style.cssText = "padding:40px 20px;text-align:center;";

  const icon = document.createElement("p");
  icon.textContent = "⚠️";
  icon.style.cssText = "font-size:3rem;margin:0 0 16px;";

  const title = document.createElement("p");
  title.className = "live-empty";
  title.textContent = "Unable to load videos";
  title.style.cssText = "margin:0 0 8px;font-size:1.1rem;";

  const message = document.createElement("p");
  message.className = "live-empty";
  message.style.cssText = "font-size:0.85rem;margin:0 0 20px;opacity:0.7;";

  if (errorMsg.includes("quota")) {
    message.textContent = "API quota exceeded. Please try again later.";
  } else if (errorMsg.includes("Timeout") || errorMsg.includes("timeout")) {
    message.textContent = "The request took too long. Please check your connection.";
  } else if (errorMsg.includes("Network") || errorMsg.includes("fetch")) {
    message.textContent = "Unable to reach the server. Check your internet connection.";
  } else {
    message.textContent = "Something went wrong while loading videos.";
  }

  const retryBtn = document.createElement("button");
  retryBtn.className = "btn btn-line";
  retryBtn.textContent = "Try Again";
  retryBtn.style.cssText = "cursor:pointer;";
  retryBtn.addEventListener("click", () => {
    window.location.reload();
  });

  errorWrapper.appendChild(icon);
  errorWrapper.appendChild(title);
  errorWrapper.appendChild(message);
  errorWrapper.appendChild(retryBtn);
  container.appendChild(errorWrapper);
}

function appendFlyoutLink(flyout, { title, url }) {
  if (!isValidHttpUrl(url)) return;

  const a = document.createElement("a");
  a.className   = "flyout-link";
  a.href        = url;
  a.target      = "_blank";
  a.rel         = "noopener noreferrer";
  a.textContent = title || "Video";
  flyout.appendChild(a);
}

function appendMediaCard(container, video) {
  const { id, title, url, thumbnail } = video;

  const safeVideoUrl = isValidHttpUrl(url) ? url : id ? `https://youtu.be/${id}` : "";
  const bgUrl = isValidHttpUrl(thumbnail) ? thumbnail : coverUrl(id);

  const card = document.createElement("article");
  card.className = "media-card reveal";

  const escapedBgUrl = bgUrl.replace(/[\\"']/g, (match) => {
    const escapes = { '"': '\\"', "'": "\\'", "\\": "\\\\" };
    return escapes[match] || match;
  });
  card.style.setProperty("--bg", `url('${escapedBgUrl}')`);

  if (safeVideoUrl) {
    card.addEventListener("click", () => window.open(safeVideoUrl, "_blank", "noopener"));
  }

  const body = document.createElement("div");
  body.className = "media-card-body";

  const titleEl = document.createElement("h3");
  titleEl.className = "media-title";
  titleEl.textContent = title || "Untitled video";

  const link = document.createElement("a");
  link.className = "btn btn-line";
  link.textContent = "Watch";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (safeVideoUrl) link.href = safeVideoUrl;
  link.addEventListener("click", (event) => event.stopPropagation());

  body.appendChild(titleEl);
  body.appendChild(link);
  card.appendChild(body);

  container.appendChild(card);
  observeReveal(card);
  return card;
}

function renderVideos(videos) {
  clearSkeletons($videoList);
  $videoList.innerHTML = "";
  if ($videoFlyout) $videoFlyout.innerHTML = "";

  const cards = videos.map((v) => appendMediaCard($videoList, v));

  if ($videoFlyout) {
    for (const v of videos) appendFlyoutLink($videoFlyout, v);
  }

  if (cards.length <= CONFIG.VISIBLE_VIDEO_COUNT) return;

  cards.forEach((card, i) => {
    if (i >= CONFIG.VISIBLE_VIDEO_COUNT) card.classList.add("is-hidden-card");
  });

  document.getElementById("showMoreBtn")?.remove();

  const btn = document.createElement("button");
  btn.id = "showMoreBtn";
  btn.className = "btn btn-ghost show-more-btn";
  btn.textContent = `Show all ${videos.length} videos`;
  let expanded = false;

  btn.addEventListener("click", () => {
    expanded = !expanded;
    cards.forEach((card, i) => {
      if (i >= CONFIG.VISIBLE_VIDEO_COUNT) {
        card.classList.toggle("is-hidden-card", !expanded);
      }
    });
    btn.textContent = expanded ? "Show less" : `Show all ${videos.length} videos`;
  });

  $videoList.parentNode.insertBefore(btn, $videoList.nextSibling);
}

function renderStreams(streams) {
  clearSkeletons($liveList);
  $liveList.innerHTML = "";
  if ($liveFlyout) $liveFlyout.innerHTML = "";

  if (!streams.length) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "live-empty";
    emptyMsg.textContent = "No active streams right now.";
    $liveList.appendChild(emptyMsg);
    return;
  }

  for (const s of streams) {
    appendMediaCard($liveList, s);
    if ($liveFlyout) appendFlyoutLink($liveFlyout, s);
  }
}


/* ─── 6. Scroll Reveal Animation ───────────────────────────────────────── */

const revealObs = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObs.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.1 }
);

function observeReveal(el) {
  revealObs.observe(el);
}

document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 50, 200)}ms`;
  revealObs.observe(el);
});


/* ─── 7. Background Video Fallback ─────────────────────────────────────── */

const $pageBg = document.querySelector(".page-bg");
const $bgVideo = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initBgVideo() {
  if (!$bgVideo || reducedMotion) return;
  if (!$bgVideo.paused) return;

  $bgVideo.play().then(() => {
    console.log("[EssKey] BG video playing");
  }).catch(() => {
    console.log("[EssKey] BG video blocked, waiting for user interaction");
    const retry = () => {
      $bgVideo.play().catch(() => {});
    };
    document.addEventListener("touchstart", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true, passive: true });
  });
}


/* ─── 8. Featured YouTube Player ───────────────────────────────────────── */

const $playerHost    = document.getElementById("featuredPlayer");
const $playerFallback = document.getElementById("playerFallback");
const $playerPlayBtn  = document.getElementById("playerPlayBtn");

let playerLoaded  = false;
let latestVideos   = [];

if ($playerPlayBtn) $playerPlayBtn.classList.add("is-visible");

function bootPlayer(videoId, videoUrl) {
  if (!$playerHost) return;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.error("[EssKey] Invalid video ID:", videoId);
    return;
  }

  if ($playerFallback && isValidHttpUrl(videoUrl)) {
    $playerFallback.href = videoUrl;
  }

  playerLoaded = true;
  $playerHost.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&modestbranding=1`;
  iframe.allow = "autoplay; encrypted-media";
  iframe.allowFullscreen = true;
  iframe.style.cssText = "width:100%;height:100%;border:0;position:absolute;inset:0";
  $playerHost.appendChild(iframe);
}

function tryAutoBoot() {
  if (latestVideos.length && !playerLoaded) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bootPlayer(latestVideos[0].id, latestVideos[0].url);
        if ($playerPlayBtn) $playerPlayBtn.classList.remove("is-visible");
        if ($playerFallback) $playerFallback.classList.add("is-visible");
      });
    });
  }
}

if ($playerPlayBtn) {
  $playerPlayBtn.addEventListener("click", () => {
    if (!latestVideos.length) return;
    const v = latestVideos[0];
    bootPlayer(v.id, v.url);
    $playerPlayBtn.classList.remove("is-visible");
    if ($playerFallback) $playerFallback.classList.add("is-visible");
  });
}


/* ─── 9. Contact Form ──────────────────────────────────────────────────── */

const $form   = document.getElementById("contactForm");
const $status = document.getElementById("formStatus");

if ($form && $status) {
  const $nameField = $form.querySelector("#name");
  const $emailField = $form.querySelector("#email");
  const $msgField = $form.querySelector("#message");

  let statusTimeout = null;

  function showStatus(message, type = "info", duration = 5000) {
    $status.textContent = message;
    $status.className = `form-status form-status--${type}`;
    $status.style.opacity = "1";

    if (statusTimeout) clearTimeout(statusTimeout);
    if (duration > 0) {
      statusTimeout = setTimeout(() => {
        $status.style.opacity = "0";
      }, duration);
    }
  }

  if ($nameField) {
    $nameField.addEventListener("blur", () => {
      const val = $nameField.value.trim();
      if (val && val.length < 2) {
        showStatus("Name should be at least 2 characters.", "error", 3000);
      }
    });
  }

  if ($emailField) {
    $emailField.addEventListener("blur", () => {
      const val = $emailField.value.trim();
      if (val && !isValidEmail(val)) {
        showStatus("Please enter a valid email address.", "error", 3000);
      }
    });
  }

  $form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name  = $nameField.value.trim();
    const email = $emailField.value.trim();
    const msg   = $msgField.value.trim();

    if (name.length < 2) {
      showStatus("Please enter your name (at least 2 characters).", "error");
      $nameField.focus();
      return;
    }
    if (name.length > 60) {
      showStatus("Name is too long (max 60 characters).", "error");
      $nameField.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showStatus("Please enter a valid email address.", "error");
      $emailField.focus();
      return;
    }
    if (email.length > 120) {
      showStatus("Email is too long (max 120 characters).", "error");
      $emailField.focus();
      return;
    }
    if (msg.length < 8) {
      showStatus("Please write a message (at least 8 characters).", "error");
      $msgField.focus();
      return;
    }
    if (msg.length > 1000) {
      showStatus("Message is too long (max 1000 characters).", "error");
      $msgField.focus();
      return;
    }

    const subj = encodeURIComponent(`EssKey Music Contact Form — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    const mailtoLink = `mailto:EssKey_YTB@protonmail.com?subject=${subj}&body=${body}`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    try {
      window.location.href = mailtoLink;
      showStatus(
        isMobile
          ? "Opening your email app... If nothing happens, please email us directly."
          : "Your email program should open now. If it doesn't, please copy the email address above.",
        "success",
        8000
      );

      setTimeout(() => {
        $form.reset();
      }, 1000);

    } catch (err) {
      console.error("[EssKey] Mailto error:", err);
      showStatus(
        "Could not open email client. Please email us directly at EssKey_YTB@protonmail.com",
        "error",
        0
      );
    }
  });
}


/* ─── 10. Preloader ────────────────────────────────────────────────────── */

function runPreloader(fontsReady, dataReady) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) {
    document.body.classList.remove("is-loading");
    return Promise.resolve();
  }

  let pct      = 0;
  let finished = false;
  let resolveFn;
  const done = new Promise((r) => { resolveFn = r; });

  function setPct(v) {
    pct = Math.min(Math.round(v), 100);
    $preloaderBar.style.width = pct + "%";
    $preloaderPct.textContent = pct + "%";
  }

  function reveal() {
    if (finished) return;
    finished = true;
    setPct(100);
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
    setTimeout(resolveFn, 600);
  }

  const ramp = setInterval(() => {
    pct += Math.random() * 5 + 1;
    if (pct > 40) pct = 40;
    setPct(pct);
  }, 120);

  fontsReady.then(() => {
    clearInterval(ramp);
    if (pct < 60) setPct(60);
  });

  dataReady.then(() => {
    clearInterval(ramp);
    const from    = Math.max(pct, 60);
    const start   = performance.now();
    const duration = 500;
    function animate(now) {
      const t    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setPct(from + (100 - from) * ease);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        reveal();
      }
    }
    requestAnimationFrame(animate);
  }).catch(() => {
    reveal();
  });

  setTimeout(reveal, CONFIG.PRELOADER_MAX_TIME);

  return done;
}


/* ─── 11. Parallax Background ──────────────────────────────────────────── */

function initParallax() {
  if (!$pageBg || reducedMotion) return;

  let currentY = 0;
  let targetY  = 0;
  let ticking  = false;

  function update() {
    currentY += (targetY - currentY) * 0.1;
    if (Math.abs(targetY - currentY) < 0.05) currentY = targetY;
    $pageBg.style.transform = `translate3d(0, ${currentY}px, 0)`;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    targetY = window.scrollY * CONFIG.PARALLAX_FACTOR;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
}


/* ─── 12. Bootstrap (Entry Point) ──────────────────────────────────────── */

// Show skeleton placeholders while data loads
renderSkeletons($videoList, CONFIG.VISIBLE_VIDEO_COUNT);
renderSkeletons($liveList, 2);

// Wait for fonts
const fontsReady = document.fonts?.ready || Promise.resolve();

// Fetch video data — single API request, separated into videos + streams
const dataReady = fetchYouTubeVideos()
  .then(({ videos, streams }) => {
    console.log(`[EssKey] Loaded ${videos.length} videos, ${streams.length} streams. Latest: "${videos[0]?.title}"`);
    latestVideos = videos;
    renderVideos(videos);
    renderStreams(streams);
    return videos;
  })
  .catch((err) => {
    console.error("[EssKey] Fetch failed:", err.message);
    clearSkeletons($videoList);
    clearSkeletons($liveList);
    renderErrorState($videoList, err.message);
    return [];
  });

// Run preloader then init everything
runPreloader(fontsReady, dataReady).then(() => {
  initBgVideo();
  initParallax();
  tryAutoBoot();
  dataReady.then(tryAutoBoot);
});
