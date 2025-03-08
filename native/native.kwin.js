
SERVICE_NAME = 'org.mozilla.firefox'
OBJECT_PATH = '/extension/berrylium/windowsmover'
INTERFACE_NAME = 'local.firefox_windows_mover_native_host.KWinScriptAgent'

// snippet
function callService(...args) {
    callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, ...args)
}

print('hello')

// simple debug function
function verbose(obj) {
    if (typeof(obj) !== "object")
        return obj;
    let str = '{';
    let keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        str += key;
        if (obj[key] !== undefined)
            str += ': ' + verbose(obj[key]);
        if (i < keys.length - 1) {
            str += ', ';
        }
    }
    str += '}';
    return str
}

function sendCurrentDesktop() {
    callService('sendMessage', {
        desktop: workspace.currentDesktop.id,
        activity: workspace.currentActivity
    })
}
sendCurrentDesktop()
workspace.currentDesktopChanged.connect(sendCurrentDesktop)
workspace.currentActivityChanged.connect(sendCurrentDesktop)


GET_ID_REGEX = /^[0-9]*$/
function getFirefoxWindowID(caption) {
    const parts = caption.split('@', 1)
    if (parts.length >= 1 && GET_ID_REGEX.test(parts[0]))
        return Number(parts[0]);
    return undefined;
}


// sorry I'm not familiar with OOP in JS, so I'm using a closure!
window_by_ID = new Map()
function trackWindow(window) {
    let id = undefined
    var sendWindowPosition = function() {
        var desktopIDs = []
        if (!window.onAllDesktops)
            desktopIDs = window.desktops.map((desktop) => desktop.id)
        var activityIDs = window.activities
        callService('sendMessage', {
                winID: id,
                desktops: desktopIDs,
                activities: activityIDs
            })
    }
    var moveWindow = function(desktops, activities) {
        let targetActivities = new Set(activities)
        let targetDesktops = new Set(desktops)
        window.activities = workspace.activities.filter((act) => targetActivities.has(act))
        window.desktops = workspace.desktops.filter((desktop) => targetDesktops.has(desktop.id))
    }
    var dealWithMessage = function(msg) {
        if (msg.type === 'query') {
            sendWindowPosition()
        } else {
            moveWindow(msg.desktops, msg.activities)
            //sendWindowPosition()
        }
    }
    var onClosed = function() {
        window_by_ID.set(id, undefined)
    }
    var onNewFirefoxWindowDetected = function() {
        window_by_ID.set(id, dealWithMessage)
        window.desktopsChanged.connect(() => {print('desktop change');sendWindowPosition()})
        window.activitiesChanged.connect(() => {print('activity change');sendWindowPosition()})
        window.closed.connect(onClosed)
    }
    if (window.desktopFileName == 'firefox') { /* maybe we can add more filters here? */
        id = getFirefoxWindowID(window.caption)
        if (id !== undefined) {
            onNewFirefoxWindowDetected()
        } else {
            // since there might be delay in setting the window title preface...
            var onTitleChange = function() {
                id = getFirefoxWindowID(window.caption)
                if (id !== undefined) {
                    onNewFirefoxWindowDetected()
                    window.captionChanged.disconnect(onTitleChange)
                }
            }
            window.captionChanged.connect(onTitleChange)
        }
    }
}
// track all existing windows and future windows
workspace.windowAdded.connect(trackWindow)
windowList = workspace.windowList()
for (i in windowList) trackWindow(windowList[i])

function onMessage(msg) {
    print(verbose(msg))
    if (msg.winID === undefined) {
        workspace.currentDesktop = workspace.desktops.find((desktop) => desktop.id == msg.desktop)
        workspace.currentActivity = msg.activity
    } else {
        messageDealer = window_by_ID.get(msg.winID)
        messageDealer(msg)
    }
}
function onTimer() {
    callService('getPendingMessage', function(list) {
        for(let i = 0; i < list.length; i++)
            onMessage(list[i]);
    })
}
timer = new QTimer()
timer.interval = 20 // ms
timer.timeout.connect(onTimer);
timer.start()