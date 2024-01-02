(() => {
	// constants, or settings
	const CTRL = 17; // keycode to stop
	const DELAY = 300; // 1000 = 1 sec
	const LOWERTAG = "hbcptooltip";
	const UPPERTAG = LOWERTAG.toUpperCase();
	const CLASSPREFIX = "hbcp_";
	const MAXWIDTHR = 0.5; // ratio to screen
	const MAXHEIGHTR = 0.7;
	const OFFSETX = 10; // position of tooltip
	const OFFSETY = 10; // relative to cursor
	const TIPSTYLE = {
		visibility: "hidden", // to be made visible later
		display: "block", // "none" prevents size calculation
		position: "fixed",
		overflow: "hidden scroll",
		left: 0, // will be placed near the cursor later
		top: 0,
		zIndex: 9999999,
		backgroundColor: "rgba(0,0,0,0.8)",
		color: "white",
		boxShadow: "0 0 5px 2px rgba(255,255,255,0.5)",
		padding: "3px",
	};

	// global variables
	const cache = {};
	let timeout = undefined;
	let shown = undefined;
	let pressed = false;
	let mouseX = 0;
	let mouseY = 0;

	async function fetchComments(anchor) {
		const url = anchor.href;
		const startTime = Date.now();
		let result;
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error("response status " + response.status);
			}

			const dom = new DOMParser().parseFromString(
				await response.text(), "text/html"
			);
			const div = dom.querySelector("div.is-active.bookmarks-sort-panel");
			let pes = div;
			while (pes = pes.previousElementSibling) {
				if (pes.classList.contains("entry-comment-unavailable")) {
					div.insertBefore(pes, div.firstChild);
					break;
				}
			}
			result = cache[url] = div;
		} catch (e) {
			// movies with no comments are often just too young
			// so don't cache them
			cache[url] = false;
			result = commentList(e.message);
		}
		if (anchor != shown) return; // mouse already left
		setTooltip(anchor, result, Date.now() - startTime);
	}

	function enc(url) {
		if (url?.match(/^https?:\/\/b\.hatena\.ne\.jp\/entry\//)) {
			return btoa(url)
				.replace(/=/g, "")
				.replace(/\+/g, "-")
				.replace(/\//g, "_");
		}
	}

	function mouseEnterListener(event) {
		const anchor = event.target;
		if (
			!anchor
			|| anchor.tagName !== "A"
			|| findAncestor(anchor, UPPERTAG)
		) return;

		const url = anchor.href;
		if (
			!enc(url)
			|| url === location.href
			|| url === shown?.href
			|| cache[url] == "fetching"
		) return;

		hideTips(); // this does "shown = undefined"
		shown = anchor;
		cutTitles(anchor);

		if (cache[url]) {
			console.log("cache found", url, cache[url]);
			setTooltip(anchor, cache[url]);
			return;
		}

		cache[url] = "fetching";
		console.log("fetch", url);
		// do a fetch even when pressed
		setTooltip(anchor, commentList("⌛ waiting for comments... ⌛"));
		fetchComments(anchor);
	}

	function cutTitles(elem) {
		// disable anchor tooltips
		const title = elem.getAttribute("title");
		if (title) {
			elem.setAttribute("oldtitle", title);
			elem.removeAttribute("title");
		}
		[...elem.children].forEach((child) => {
			cutTitles(child); // even spans can have titles
		});
	}

	function setTooltip(anchor, comments, passed = 0) {
		clearTimeout(timeout);
		if (pressed) return;

		timeout = setTimeout(
			showTip.bind(null, anchor, comments),
			Math.max(0, DELAY - passed)
		);
	}

	function showTip(anchor, comments) {
		if (anchor && anchor !== shown) return;

		const cname = CLASSPREFIX + enc(anchor.href);
		const usedtip = document.querySelector(`${LOWERTAG}.${cname}`);
		while (usedtip?.firstChild) usedtip.removeChild(usedtip.firstChild);
		// get values while it's visible
		const tipX = Math.max(0, usedtip ? usedtip.offsetLeft : mouseX + OFFSETX);
		const tipY = Math.max(0, usedtip ? usedtip.offsetTop : mouseY + OFFSETY);

		const tooltip = usedtip || document.createElement(LOWERTAG);
		tooltip.appendChild(document.createElement("p"))
			.textContent = comments.getAttribute("data-sort");
		tooltip.appendChild(comments);
		Object.assign(tooltip, {
			className: cname,
			onclick: () => {
				hideTips();
				shown = anchor; // avoid showing the tip again
			},
		});
		if (!usedtip) {
			document.body.appendChild(tooltip);
		}

		const fullW = document.documentElement.clientWidth;
		const fullH = document.documentElement.clientHeight;
		const maxW = fullW * MAXWIDTHR;
		const maxH = fullH * MAXHEIGHTR;
		Object.assign(tooltip.style, {
			...TIPSTYLE,
			// first, calculate maximum
			left: Math.min(fullW - maxW, tipX) + "px",
			top: Math.min(fullH - maxH, tipY) + "px",
			maxWidth: maxW + "px",
			maxHeight: maxH + "px",
		});
		// second, calculate x and y from real w and h
		Object.assign(tooltip.style, {
			left: Math.min(fullW - tooltip.offsetWidth, tipX) + "px",
			top: Math.min(fullH - tooltip.offsetHeight, tipY) + "px",
			visibility: "visible",
		})

		console.log("tooltip shown", anchor.href, tooltip);
	}

	function hideTips() {
		clearTimeout(timeout);
		timeout = undefined;
		shown = undefined;
		for (let tip of document.body.getElementsByTagName(LOWERTAG)) {
			tip.remove();
		}
	}

	function commentList(text) {
		const div = document.createElement("div");
		div.appendChild(document.createElement("p")).textContent = text;
		return div;
	}

	// the only event reliable enough to hide tooltips
	// others are not useful when mouse moves fast
	function mouseMoveListener(event) {
		mouseX = event.clientX;
		mouseY = event.clientY;

		const elem = document.elementFromPoint(mouseX, mouseY);
		if (!elem) return;
		if (!findAncestor(elem, UPPERTAG)) {
			const ancestorAnchor = findAncestor(elem, "A");
			if (shown && (!ancestorAnchor || ancestorAnchor.href !== shown.href)) {
				hideTips();
			} else if (!shown && ancestorAnchor) {
				mouseEnterListener({ target: ancestorAnchor });
			}
		}
	}

	function findAncestor(elem, type) {
		if (!elem || elem.tagName === "BODY") return;
		if (elem.tagName === type) return elem;
		return findAncestor(elem.parentElement, type);
	}

	function keyDownListener(event) {
		if (event.keyCode == CTRL) {
			hideTips();
			pressed = true;
		}
	}

	function keyUpListener(event) {
		if (event.keyCode == CTRL) {
			pressed = false;
		}
	}

	// set {useCapture: true} to detect all anchors with the single listener
	document.addEventListener("mouseenter", mouseEnterListener, true);
	document.addEventListener("mousemove", mouseMoveListener);
	document.addEventListener("keydown", keyDownListener);
	document.addEventListener("keyup", keyUpListener);

	// wipe tooltips every time href changes
	/* // personally i don't need this feature
	let prevHref = location.href;
	function loadListener(event) {
		new MutationObserver((mutations) => {
			if (prevHref != location.href) {
				console.log("href changed from", prevHref, "to", location.href);
				hideTips();
				prevHref = location.href;
			}
		}).observe(document.body, { childList: true, subtree: true });
	}
	window.addEventListener("load", loadListener);
	*/
})();
