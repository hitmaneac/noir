/* Bootstrap: build the scene graph, then start the engine. The engine loads the
 * room settings, stylesheet and collision map itself (per level). No jQuery. */
(function () {
	// scene graph: clouds < background < character < fence < msg
	var game = document.createElement('div');
	game.className = 'game';
	['clouds', 'background', 'character', 'fence', 'msg'].forEach(function (name) {
		var d = document.createElement('div');
		d.className = name;
		game.appendChild(d);
	});
	document.body.appendChild(game);

	// cache-bust engine.js so edits are always picked up on a normal reload
	// (settings/actions/css are already loaded with a ?t= query by the engine)
	var s = document.createElement('script');
	s.src = 'js/engine.js?t=' + Date.now();
	document.body.appendChild(s);
})();
