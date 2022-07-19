const DEBUG = false;
const API_KEY = ''; // Use yours
const CTRL = 17;
const MAXCOMLEN = 150;
const MAXCOMNUM = 10;
const COMORDER = 'relevance';
const MAXWIDTHR = 0.5;
const MAXHEIGHTR = 0.7;
const cache = {};
let pressed = false;

function fetchComments(videoId) {
	if (cache[videoId]) {
		return new Promise((resolve, reject) => {
			resolve(cache[videoId]);
		});
	}
	const url = 'https://www.googleapis.com/youtube/v3/commentThreads'
			+ '?part=snippet&textFormat=plaintext'
			+ '&key=' + API_KEY
			+ '&order=' + COMORDER
			+ '&maxResults=' + MAXCOMNUM
			+ '&videoId=' + videoId;
	return fetch(url).then(response => {
		if(!response.ok)
			throw new Error('response is not ok');
		return response.json();
	}).then(json => {
		if (DEBUG == true)
			console.log("json: ", json);
		let comments = "";
		for (let i = 0; i < json.items.length; i++) {
			const item = json.items[i];
			const comment = item.snippet.topLevelComment.snippet.textDisplay;
			comments += "<li>" + comment.substring(0, MAXCOMLEN) + "</li>";
		}
		return cache[videoId] = comments;
	});
}

function mouseEnterListener(event) {
	const anchor = event.target;
	if (anchor.tagName != "A")
		return;
	if (!anchor.href.match(/^https:\/\/www\.youtube\.com\/watch\?v=[^&]/))
		return
	const vid = anchor.href
		.replace(/^https:\/\/www\.youtube\.com\/watch\?v=([^&]+)(&.*)?$/, '$1');
	if (DEBUG == true)
		console.log("mouseenter: ", vid);

	fetchComments(vid).then(comments => {
		if (pressed)
			return;
		const fullW = document.documentElement.clientWidth;
		const fullH = document.documentElement.clientHeight;

		const popup = document.createElement("tooltip");
		popup.innerHTML = comments;
		popup.style.visibility = "hidden";
		popup.style.display = "block";
		popup.style.position = "fixed";
		popup.style.maxWidth = (fullW * MAXWIDTHR) + 'px';
		popup.style.maxHeight = (fullH * MAXHEIGHTR) + 'px';
		popup.style.left = 0;
		popup.style.top = 0;
		popup.style.zIndex = 9999999;
		popup.style.backgroundColor = "black";
		popup.style.color = "white";

		popup.onmouseleave = function(){this.remove();};
		popup.onclick = function(){this.remove();};
		//anchor.onmouseleave = function(){this.remove();}.bind(popup);

		removeTips();
		document.body.appendChild(popup);

		const popW = popup.offsetWidth;
		const popH = popup.offsetHeight;
		const curX = event.clientX + 10;
		const curY = event.clientY + 10;
		popup.style.left = ((curX + popW > fullW) ? fullW - popW : curX) + 'px';
		popup.style.top = ((curY + popH > fullH) ? fullH - popH : curY) + 'px';
		popup.style.visibility = "visible";
	}).catch(error => {
		if (DEBUG == true)
			console.log(error);
	});
}

function removeTips() {
	for (let tip of document.body.getElementsByTagName("tooltip")) {
		tip.remove();
	}
}

function keyDownListener(event) {
	if (event.keyCode == CTRL) {
		removeTips();
		pressed = true;
	}
}

function keyUpListener(event) {
	if (event.keyCode == CTRL)
		pressed = false;
}

document.addEventListener("mouseenter", mouseEnterListener, true);
document.addEventListener("keydown", keyDownListener);
document.addEventListener("keyup", keyUpListener);
