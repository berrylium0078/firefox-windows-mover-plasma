# firefox-windows-mover-plasma

What can this extension do:
- Ensure new windows/tabs appear on the current virtual desktop and activity.
- Remember the last used desktops for each window, and restore them when the window is reopened.

How it works:
- It employs a local host to move the windows around and listen for desktop events.
- The window id will be shown in the window's title(should be hidden by default), in order that the local host can identify them.
- When a tab is created in another desktop, it will be moved to a new window that will be moved to the current desktop.

Currently, this extension only works on Plasma desktop environment, and I have no intention to migrate to other DE/OS.
Forks or pull requests are welcomed.

Usage:
- Clone this repository.
- Run `make install` to install native messaging host. May require root privileges.
- Run `make` to generate `.xpi` file, then install the extension in firefox.
- Run `make uninstall` to uninstall.

Known issues:
- When opening a desktop entry, the desktop environment may switch to the desktop where the created tab is located.
  - It's recommended to modify the system settings: Go to Window Behavior > Advanced > Virtual Desktop behavior > When activating a window on a different Virtual Desktop, switch it to 'Do nothing'.
  - Although I have added a fix, which forcefully switches back to the previous desktop when the tab is created. But somehow it doesn't work when the window is located in a different activity and different desktop, and the above setting is 'switch to that Virtual Desktop'.