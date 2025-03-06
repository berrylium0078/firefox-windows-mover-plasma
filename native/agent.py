#!/usr/bin/python3
import os, sys, json, struct, threading, signal, time
from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal, QTimer
from PyQt6.QtWidgets import QApplication
from PyQt6.QtDBus import QDBusConnection, QDBusInterface, QDBusMessage

# constants
SERVICE_NAME = "org.mozilla.firefox"
OBJECT_PATH = "/extension/berrylium/windowsmover"
SCRIPT_NAME = 'native.kwin.js'
SCRIPT_PATH = '/usr/share/kwin/scripts/firefox-windows-mover'
# SCRIPT_PATH = os.path.dirname(os.path.realpath(__file__))

# for logging
#logFile = open('/tmp/activityintegration.log', 'w')
def log(str):
    return
    time_str = time.strftime('%Y%m%d %H:%M:%S', time.localtime())
    print(f'[{time_str}]: {str}', file=logFile, flush=True)

# listen for messages from firefox
class FirefoxListener(QObject):
    messageReceived = pyqtSignal(str)
    disconnected = pyqtSignal()
    def __init__(self):
        super().__init__()
    # will be running in a separate thread
    def run(self):
        while True:
            rawLength = sys.stdin.buffer.read(4)
            if len(rawLength) == 0: # ???
                self.disconnected.emit()
                break
            messageLength = struct.unpack('@I', rawLength)[0]
            message = sys.stdin.buffer.read(messageLength).decode('utf-8')
            self.messageReceived.emit(message)
 
# communicate with kwin script
class KWinScriptAgent(QObject):
    def __init__(self):
        super().__init__()
        self.message = []
    # receive message from firefox
    @pyqtSlot(str)
    def receiveMessage(self, message):
        log(f'firefox => {message}')
        self.message.append(json.loads(message))

    # check incoming messages from firefox
    @pyqtSlot(result=list)
    def getPendingMessage(self):
        result, self.message = self.message, []
        return result
    # send message to firefox
    @pyqtSlot('QVariantMap')
    def sendMessage(self, obj):
        log(f'kwin => {obj}')
        message = json.dumps(obj, indent=None, separators=(',', ':')).encode('utf-8')
        length = struct.pack('@I', len(message))
        sys.stdout.buffer.write(length)
        sys.stdout.buffer.write(message)
        sys.stdout.buffer.flush()

if __name__ == '__main__':
    # initialize
    app = QApplication(sys.argv)
    bus = QDBusConnection.sessionBus()
    listener = FirefoxListener()
    agent = KWinScriptAgent()
    listener.messageReceived.connect(agent.receiveMessage)

    # make Qt responsive to UNIX signals
    # not necessary since KWin script will call getPendingMessage() periodically
    timer = QTimer()
    timer.setInterval(1000)
    timer.timeout.connect(lambda: None)
    timer.start()

    # register DBus interface for kwin agent
    if not bus.registerService(SERVICE_NAME):
        log("Failed to register D-Bus service!")
        exit(1)
    if not bus.registerObject(OBJECT_PATH, agent, QDBusConnection.RegisterOption.ExportAllSlots):
        log("Failed to register D-Bus object!")
        exit(1)
    log(f"D-Bus service '{SERVICE_NAME}' running at '{OBJECT_PATH}'")

    # load kwin script
    scriptBus = QDBusInterface('org.kde.KWin', '/Scripting',
            'org.kde.kwin.Scripting', bus)
    if scriptBus.call('isScriptLoaded', SCRIPT_NAME).arguments()[0]:
        log("{SCRIPT_NAME} already loaded! unloading...")
        scriptBus.call('unloadScript', SCRIPT_NAME)
    script_id = scriptBus.call(
            'loadScript',
            f'{SCRIPT_PATH}/{SCRIPT_NAME}',
            SCRIPT_NAME
        ).arguments()[0]
    
    # run the script if successfully loaded
    if int(script_id) > -1:
        log(f"Loaded KWin script into ID: {script_id}")
        reply = QDBusInterface('org.kde.KWin',
            f'/Scripting/Script{script_id}',
            'org.kde.kwin.Script', bus).call('run')
        if reply.type() == QDBusMessage.MessageType.ErrorMessage:
            log(f"Failed to execute script! {reply.errorMessage()}")
            log(f'unloading {SCRIPT_NAME}...')
            scriptBus.call('unloadScript', SCRIPT_NAME)
            exit(1)
    else:
        log("Failed to load KWin script!")
        exit(1)
    
    # start listening for firefox
    threading.Thread(target=listener.run).start()

    # register clean up function
    def cleanup(signum, frame):
        log('cleaning...')
        scriptBus.call('unloadScript', SCRIPT_NAME)
        log(f'unloaded {SCRIPT_NAME}')
        bus.unregisterService(SERVICE_NAME)
        log(f'unregistered service {SERVICE_NAME}...')
        signal.signal(signum, signal.SIG_DFL)
        signal.raise_signal(signum)
    
    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    sys.exit(app.exec())