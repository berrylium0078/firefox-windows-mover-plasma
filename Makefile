NATIVE_MANIFEST_DIR := /usr/lib/mozilla/native-messaging-hosts
NATIVE_MANIFEST_FILE := windowsmover.berrylium.pyagent.json
NATIVE_APP := /usr/bin/firefox-windows-mover-native-host
SCRIPT_PATH = /usr/share/kwin/scripts/firefox-windows-mover

build:
	@cd src && zip -FS -r ../windows-mover.xpi ./*

clean:
	@rm -f windows-mover.xpi

install:
	@echo Copying $(NATIVE_MANIFEST_DIR)/$(NATIVE_MANIFEST_FILE)
	@mkdir -p $(NATIVE_MANIFEST_DIR)
	@install native/$(NATIVE_MANIFEST_FILE) $(NATIVE_MANIFEST_DIR)

	@echo Copying $(NATIVE_APP)
	@install native/agent.py $(NATIVE_APP)

	@echo Copying $(SCRIPT_PATH)/native.kwin.js
	@mkdir -p $(SCRIPT_PATH)
	@install native/native.kwin.js $(SCRIPT_PATH)/native.kwin.js

	@echo 'Local host installation complete'
	@echo 'Remember to install the firefox extension'

uninstall:
	@rm -f $(NATIVE_MANIFEST_DIR)/$(NATIVE_MANIFEST_FILE)
	@rm -f $(NATIVE_APP)
	@rm -rf $(SCRIPT_PATH)