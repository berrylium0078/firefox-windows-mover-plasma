var port = browser.runtime.connectNative("windowsmover.berrylium.pyagent");

port.postMessage({
    type: "config",
    ID_pattern: {
        prefix: '#',
        suffix: '@'
    }
});

/* windowData = {desks: Set(string), actvs: Set(string), timer: maybe(int) } */
function newWindowData() {
    return {desks: new Set(), actvs: new Set()};
}

/* windowID: int => windowData */
var windows = new Map();

/* check if a window (given its ID) is visible on (desk, actv) */
function is_win_at(wid, desk, actv) {
    var win = windows.get(wid);
    if (win === undefined) return true;
    return (win.desks.size == 0 || win.desks.has(desk)) &&
        (win.actvs.size == 0 || win.actvs.has(actv));
}

/* [windowID], sorted in descending order of last focused time */
var recentFocus = [];

/* call this when a window is removed */
function removeFocus(wid) {
    index = recentFocus.indexOf(wid)
    if (index >= 0)
        recentFocus.splice(index, 1)
}

/* call this when a window is added */
function addFocus(wid) {
    recentFocus.unshift(wid)
}
/* this is safer */
function updateFocus(wid) {
    removeFocus(wid);
    addFocus(wid);
}

/* when a window is updated, call removeFocus() and then addFocus() */

/* find the last focused window on (desk, actv) */
function getLastFocus(desk, actv) {
    return recentFocus.find((wid) => is_win_at(wid, desk, actv))
}

var curDesk = undefined;
var curActv = undefined;
var switchTimer = undefined;

function onMessageReceived(msg) {
    console.log(msg);
    if (msg.type == 'desktop.update') {
        // Appears that firefox has no aware of the virtual desktop in KDE.
        // If a tab is created simultaneously (<100ms) when switching desktop,
        // it means that the tab is attached to the wrong window.
        if (switchTimer == -1) {
            switchTimer = undefined;
        } else {
            switchTimer = setTimeout(() => {
                    curDesk = msg.desk;
                    curActv = msg.actv;
                    switchTimer = undefined;
                }, 1000);
        }
    } else if (msg.type == 'window.update') {
        var window = windows.get(msg.wid);
        // in case the window has been destroyed
        if (window === undefined) return;
        window.actvs = new Set(msg.actvs);
        window.desks = new Set(msg.desks);
        console.log(`update window ${msg.wid} ${msg.actvs} ${msg.desks}`)
        browser.sessions.setWindowValue(msg.wid, "pos", {
            actvs: msg.actvs,
            desks: msg.desks
        });
    }
}

var counter = 0;
function allocate_dumb_wid() {
    counter = counter - 1;
    return counter;
}

var faultyTabs = new Map(); // Map(tabId: int, dumbWindowId: int)

// Case 1: a window is restored
// Case 2: opened a new window, with some tabs in it
// Case 3: opened a link in new tab, but window in another desktop
function onTabCreated(tab) {
    var tid = tab.id;
    var wid = tab.windowId;

    console.log(`new tab: ${tid} ${wid}`)

    if (!windows.has(wid)) {
        // this window is recently created
        // none of this function's business
        return;
    }
    // The following code shouldn't be executed during start up,
    // thus curDesk & curActv are defined

    // this tab should lay inside window #target_wid
    var target_wid = getLastFocus(curDesk, curActv);

    if (target_wid === wid) return;

    console.log(`faulty tab detected: ${tid} ${wid} => ${target_wid}`)
    console.log(`${switchTimer}`)
    console.log(`current: ${curDesk} ${curActv}`)
    if (switchTimer !== -1) {
        if (switchTimer !== undefined)
            clearTimeout(switchTimer);
        switchTimer = -1;
        port.postMessage({
            type: 'switch desktop',
            desk: curDesk,
            actv: curActv
        });
    }

    if (target_wid === undefined) {
        // no windows on the desired desktop, so we allocate a dumb wid for future window
        var dumb_wid = allocate_dumb_wid();
        console.log(`allocated dumb wid ${dumb_wid}`);
        faultyTabs.set(tid, dumb_wid);

        addFocus(dumb_wid);
        windows.set(dumb_wid, {
            desks: new Set([curDesk]),
            actvs: new Set([curActv]),
            futureTabs: [], // what (extra) tabs should the new window contain
        });

        browser.windows.create({tabId: tid}).then((window) => {
            var wid = window.id;
            console.log(`solve faulty ${tid}, ${dumb_wid} => ${wid}`);
            
            var dumb_data = windows.get(dumb_wid);
            var tabs = dumb_data.futureTabs;
            dumb_data.futureTabs = undefined;

            updateFocus(wid);
            removeFocus(dumb_wid);
            windows.set(wid, dumb_data); // might be set twice, shouldn't be a problem
            windows.delete(dumb_wid);

            if (tabs.length > 0) {
                browser.tabs.move(tabs, {windowId: wid, index: -1});
            }
        });
    } else if (target_wid < 0) {
        console.log(`dumb wid ${target_wid}`);
        // a dumb wid
        windows.get(target_wid).futureTabs.push(tid);
    } else {
        console.log(`wid ${target_wid}`);
        // a real wid
        browser.tabs.move(tid, {windowId: target_wid, index: -1});
        browser.windows.update(target_wid, {focused: true});
    }
}

function onWindowCreated(wid) {
    // We need to check whether the window is created, or restored,
    // or for faulty tabs to inhabit.

    // Rename the windows, in order that our native script can identify them.
    browser.windows.update(wid, { titlePreface: `#${wid}@` }).then(
        () => console.log(`renamed window ${wid}`)
    );

    console.log(`new window: ${wid}`)

    var desk = curDesk;
    var actv = curActv;
    browser.sessions.getWindowValue(wid, "pos").then((winData) => {
        if (winData === undefined) {
            console.log(`created window ${wid}`);
            // if created, should be right here
            browser.sessions.setWindowValue(wid, "pos", {
                desks: [desk],
                actvs: [actv]
            });
            windows.set(wid, {
                desks: new Set([desk]),
                actvs: new Set([actv])
            });
            port.postMessage({
                type: "move",
                winID: wid,
                desks: [desk],
                actvs: [actv]
            });
        } else {
            console.log(`restored window ${wid}`);
            // if restored, return to its original position
            windows.set(wid, {
                desks: new Set(winData.desks),
                actvs: new Set(winData.actvs),
            });
            port.postMessage({
                type: "move",
                winID: wid,
                desks: winData.desks,
                actvs: winData.actvs,
            });

            if (!is_win_at(wid, curDesk, curActv)) {
                port.postMessage({
                    type: "switch desktop",
                    desk: winData.desks[0],
                    actv: winData.actvs[0]
                });
            }
        }
        updateFocus(wid);
    });
}

function addWindow(wid) {
    console.log(`found window: ${wid}`);
    windows.set(wid, {desks: new Set(), actvs: new Set()});
    port.postMessage({
        type: "query",
        winID: wid,
    });
}

function onWindowRemoved(wid) {
    removeFocus(wid);
    windows.delete(wid);
}
function onFocusChanged(wid) {
    if (wid >= 0) {
        removeFocus(wid);
        addFocus(wid);
    }
}

browser.windows.onRemoved.addListener(onWindowRemoved);
browser.windows.onFocusChanged.addListener(onFocusChanged);

browser.windows.onCreated.addListener((window) => onWindowCreated(window.id))
browser.windows.getAll({windowTypes: ['normal']})
    .then((windows) => windows.forEach((window) => addWindow(window.id)))
    .catch(() => console.log(`Failed to get all windows`))

browser.tabs.onCreated.addListener(onTabCreated);


port.onMessage.addListener(onMessageReceived);

console.log(`Hello World!`)
