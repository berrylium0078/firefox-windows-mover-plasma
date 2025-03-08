let port = browser.runtime.connectNative("windowsmover.berrylium.pyagent");

function print(...args) {
    console.log(...args)
}

function generateTitlePrefix(windowID) {
    return `${windowID}@`
}

let currentDesktop = []
let currentActivity = []
let windowPosition = new Map()
function checkWindowPosition(winID, desktop, activity) {
    const win = windowPosition.get(winID)
    if (win === undefined)
        return true
    if (win.desktops.length > 0) {
        let ok = false
        for (i in win.desktops)
            if (win.desktops[i] == desktop)
                ok = true
        if (!ok)
            return false
    }
    if (win.activities.length > 0) {
        let ok = false
        for (i in win.activities)
            if (win.activities[i] == activity)
                ok = true
        if (!ok)
            return false
    }
    return true
}
function onMessageReceived(msg) {
    print(msg)
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
function addWindow(window, forceMoveToCurrentDesktop) {
    if (window.type != "normal")
        return;
    browser.windows.update(window.id, {  titlePreface: generateTitlePrefix(window.id)  });
    print('adding window', window.id)
    browser.sessions.getWindowValue(window.id, 'position').then((position) => {
        if (position === undefined && forceMoveToCurrentDesktop) {
            position = windowPosition.get(window.id)
            if (position === undefined)
                position = { desktops: [currentDesktop], activities: [currentActivity] }
        }
        print('new window: ', window.id, position)
        if (position !== undefined) {
            print('post move')
            port.postMessage({
                type: "move",
                winID: window.id,
                desktops: position.desktops,
                activities: position.activities
            });
        } else {
            print('most query')
            port.postMessage({
                type: "query",
                winID: window.id
            });
        }
    });
}
function onTabCreated(newTab) {
    let targetDesktop = currentDesktop
    let targetActivity = currentActivity
    print('tab created: ', newTab.id, ' in window: ', newTab.windowId)
    print(targetActivity, targetDesktop)
    winID = newTab.windowId
    if (checkWindowPosition(winID, targetDesktop, targetActivity)) return;
    for (const winID of windowPosition.keys()) {
        if (checkWindowPosition(winID, targetDesktop, targetActivity)) {
            browser.tabs.move(newTab.id, {
                windowId: winID,
                index: -1
            });
            return;
        }
    }
    browser.windows.create({ tabId: newTab.id, focused: false }).then((window) => {
        print('on created: ', window.id)
        windowPosition.set(window.id, {
            desktops: [targetDesktop],
            activities: [targetActivity]
        });
        print('moving window ', targetDesktop, targetActivity)
        port.postMessage({
            type: "move",
            winID: window.id,
            desktops: [targetDesktop],
            activities: [targetActivity]
        });
        print('moving desktop ', targetDesktop, targetActivity)
        port.postMessage({
            type: "move",
            desktop: targetDesktop,
            activity: targetActivity
        });
    });
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