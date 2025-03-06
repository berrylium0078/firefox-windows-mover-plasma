let port = browser.runtime.connectNative("windowsmover.berrylium.pyagent");

function generateTitlePrefix(windowID) {
    return `${windowID}@`
}

let currentDesktop = []
let currentActivity = []
let windowPosition = new Map()

function isOnCurrentDesktop(winID) {
    const win = windowPosition.get(winID)
    if (win === undefined)
        return false
    if (win.desktops.length > 0) {
        let ok = false
        for (i in win.desktops)
            if (win.desktops[i] == currentDesktop)
                ok = true
        if (!ok)
            return false
    }
    if (win.activities.length > 0) {
        let ok = false
        for (i in win.activities)
            if (win.activities[i] == currentActivity)
                ok = true
        if (!ok)
            return false
    }
    return true
}

function addWindow(window, forceMoveToCurrentDesktop) {
    if (window.type != "normal")
        return;
    browser.windows.update(window.id, {  titlePreface: generateTitlePrefix(window.id)  });
    browser.sessions.getWindowValue(window.id, 'position').then((position) => {
        if (position === undefined && forceMoveToCurrentDesktop)
            position = { desktops: [currentDesktop], activities: [currentActivity] }
        windowPosition.set(window.id, position)
        if (position !== undefined) {
            port.postMessage({
                type: "move",
                winID: window.id,
                desktops: position.desktops,
                activities: position.activities
            });
        } else {
            port.postMessage({
                type: "query",
                winID: window.id
            });
        }
    });
}
function onMessageReceived(msg) {
    //console.log('message received: ' + JSON.stringify(msg))
    if (msg.winID !== undefined) {
        windowPosition.set(msg.winID, {
            desktops: msg.desktops,
            activities: msg.activities
        })
        browser.sessions.setWindowValue(msg.winID, 'position', {
            desktops: msg.desktops,
            activities: msg.activities
        }); 
    } else {
        currentActivity = msg.activity
        currentDesktop  = msg.desktop
    }
}

function onTabCreated(newTab) {
    winID = newTab.windowId
    if (isOnCurrentDesktop(winID)) return;
    for (const winID of windowPosition.keys()) {
        if (isOnCurrentDesktop(winID)) {
            browser.tabs.move(newTab.id, {
                windowId: winID,
                index: -1
            });
            return;
        }
    }
    browser.windows.create({ tabId: newTab.id })
}

/* the first message received from native host will be passed as argument to main() */
main = function(args) {
    port.onMessage.removeListener(main);
    port.onMessage.addListener(onMessageReceived);
    currentDesktop = args.desktop;
    currentActivity = args.activity;

    //console.log("currentDesktop: " + currentDesktop);
    //console.log("currentActivity: " + currentActivity);
    
    browser.windows.onCreated.addListener((window) => addWindow(window, true));
    browser.windows.getAll().then((windowList) => {
        for (i in windowList)
            addWindow(windowList[i], false)
    });
    browser.windows.onRemoved.addListener((windowID) => {
        //console.log("window removed: " + windowID);
        windowPosition.delete(windowID)
    });
    browser.tabs.onCreated.addListener(onTabCreated);
}
port.onMessage.addListener(main);