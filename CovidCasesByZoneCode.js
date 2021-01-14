// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: calendar;

/*

This script contains the logic that allows Covid-19 Widget to work. Please do not modify this file. You can add customizations in the widget script.
Documentation is available at github.com/miltjef/CovidZones

*/

const CovidZones = {

  // Initialize shared properties.
  initialize(name, iCloudInUse) {
    this.name = name
    this.fm = iCloudInUse ? FileManager.iCloud() : FileManager.local()
    this.bgPath = this.fm.joinPath(this.fm.libraryDirectory(), "covidzones-" + this.name)
    this.prefPath = this.fm.joinPath(this.fm.libraryDirectory(), "covidzones-preferences-" + name)
    this.widgetUrl = "https://raw.githubusercontent.com/miltjef/CovidZones/main/CovidCasesByZoneCode.js"
    this.now = new Date()
    this.data = {}
    this.initialized = true
  },

  // Determine what to do when script is run.
  async runSetup(name, iCloudInUse, codeFilename, gitHubUrl) {
    if (!this.initialized) this.initialize(name, iCloudInUse)
    const backgroundSettingExists = this.fm.fileExists(this.bgPath)

    if (!this.fm.fileExists(this.fm.joinPath(this.fm.libraryDirectory(), "CovidZones-setup"))) return await this.initialSetup(backgroundSettingExists)
    if (backgroundSettingExists) return await this.editSettings(codeFilename, gitHubUrl)
    await this.generateAlert("CovidZones is set up, but you need to choose a background for this widget.",["Continue"])
    return await this.setWidgetBackground() 
  },

  // Run the initial setup.
  async initialSetup(imported = false) {
    let message, options
    if (!imported) {
      message = "Welcome to CovidZones. Make sure your script has the name you want before you begin."
      options = ['I like the name "' + this.name + '"', "Let me go change it"]
      if (await this.generateAlert(message,options)) return
    }

    message = (imported ? "Welcome to CovidZones. We" : "Next, we") + " need to check if you've given permissions to the Scriptable app. This might take a few seconds."
    await this.generateAlert(message,["Check permissions"])

    let errors = []
    if (!(await this.setupLocation())) { errors.push("location") }
    try { await CalendarEvent.today() } catch { errors.push("calendar") }
    try { await Reminder.all() } catch { errors.push("reminders") }

    let issues
    if (errors.length > 0) { issues = errors[0] }
    if (errors.length == 2) { issues += " and " + errors[1] }
    if (errors.length == 3) { issues += ", " + errors[1] + ", and " + errors[2] }

    if (issues) { 
      message = "Scriptable does not have permission for " + issues + ". Some features may not work without enabling them in the Settings app."
      options = ["Continue setup anyway", "Exit setup"]
    } else {
      message = "Your permissions are enabled."
      options = ["Continue setup"]
    }
//    if (await this.generateAlert(message,options)) return

    if (!imported) { await this.setWidgetBackground() }
    this.writePreference("CovidZones-setup", "true")

    message = "Your widget is ready! You'll now see a preview. Re-run this script to edit the default preferences, including localization. When you're ready, add a Scriptable widget to the home screen and select this script."
    await this.generateAlert(message,["Show preview"])
    return this.previewValue()
  },

  // Edit the widget settings.
  async editSettings(codeFilename, gitHubUrl) {
    const menu = { 
      preview: "Show widget preview", 
      background: "Change background", 
      preferences: "Edit preferences", 
      update: "Update code", 
      share: "Export widget", 
      exit: "Exit settings menu", 
    }
    const menuOptions = [menu.preview, menu.background, menu.preferences, menu.update, menu.share, menu.exit]
    const response = menuOptions[await this.generateAlert("Widget Setup",menuOptions)]

    if (response == menu.preview) { return this.previewValue() } 
    if (response == menu.background) { return await this.setWidgetBackground() }
    if (response == menu.preferences) { return await this.editPreferences() }

    if (response == menu.update) {
      if (await this.generateAlert("Would you like to update the CovidZones code? Your widgets will not be affected.",["Update", "Exit"])) return
      const success = await this.downloadCode(codeFilename, gitHubUrl)
      return await this.generateAlert(success ? "The update is now complete." : "The update failed. Please try again later.")
    }

    if (response == menu.share) {
      const layout = this.fm.readString(this.fm.joinPath(this.fm.documentsDirectory(), this.name + ".js")).split('`')[1]
      const prefs = JSON.stringify(await this.getSettings())
      const bg = this.fm.readString(this.bgPath)
      
      const widgetExport = `async function importWidget() {
      function makeAlert(message,options = ["OK"]) {
        const a = new Alert()
        a.message = message
        for (const option of options) { a.addAction(option) }
        return a
      }
      let fm = FileManager.local()
      fm = fm.isFileStoredIniCloud(module.filename) ? FileManager.iCloud() : fm
      const path = fm.joinPath(fm.documentsDirectory(), "CovidZones code.js")
      const wc = fm.fileExists(path) ? fm.readString(path) : false
      const version = wc ? parseInt(wc.slice(wc.lastIndexOf("//") + 2).trim()) : false
      if (wc && (!version || version < 4)) { return await makeAlert("Please update CovidZones before importing a widget.").present() }
      if ((await makeAlert("Do you want your widget to be named " + Script.name() + "?",["Yes, looks good","No, let me change it"]).present()) == 1) { return }
      fm.writeString(fm.joinPath(fm.libraryDirectory(), "weather-cal-preferences-" + Script.name()), '${prefs}')
      fm.writeString(fm.joinPath(fm.libraryDirectory(), "weather-cal-" + Script.name()), '${bg}')
      let code = await new Request('${this.widgetUrl}').loadString()
      let arr = code.split('\`')
      arr[1] = \`${layout}\`
      alert = makeAlert("Close this script and re-run it to finish setup.")
      fm.writeString(module.filename, arr.join('\`'))
      await alert.present()
      }
      await importWidget()
      Script.complete()`
      
      const shouldUseQuickLook = await this.generateAlert("Your export is ready.",["Save to Files", "Display as text to copy"])
      if (shouldUseQuickLook) {
        QuickLook.present('/*\n\n\n\nTap the Share icon in the top right.\nThen tap "Copy" to copy all of this code.\nNow you can paste into a new script.\n\n\n\n*/\n' + widgetExport)
      } else {
        DocumentPicker.exportString(widgetExport, this.name + " export.js")
      }
      return
    }

    return
  },

  // Set the background of the widget.
  async setWidgetBackground() {
    const options = ["Solid color", "Automatic gradient", "Custom gradient", "Image from Photos"]
    const backgroundType = await this.generateAlert("What type of background would you like for your widget?",options)

    const background = this.fm.fileExists(this.bgPath) ? JSON.parse(this.fm.readString(this.bgPath)) : {}
    if (backgroundType == 0) {
      background.type = "color"
      const returnVal = await this.promptForText("Background Color",[background.color,background.dark],["Default color","Dark mode color (optional)"],"Enter the hex value of the background color you want. You can optionally choose a different background color for dark mode.")
      background.color = returnVal.textFieldValue(0)
      background.dark = returnVal.textFieldValue(1)

    } else if (backgroundType == 1) {
      background.type = "auto"

    } else if (backgroundType == 2) {
      background.type = "gradient"
      const returnVal = await this.promptForText("Gradient Colors",[background.initialColor,background.finalColor,background.initialDark,background.finalDark],["Top default color","Bottom default color","Top dark mode color","Bottom dark mode color"],"Enter the hex values of the colors for your gradient. You can optionally choose different background colors for dark mode.")
      background.initialColor = returnVal.textFieldValue(0)
      background.finalColor = returnVal.textFieldValue(1)
      background.initialDark = returnVal.textFieldValue(2)
      background.finalDark = returnVal.textFieldValue(3)

    } else if (backgroundType == 3) {
      background.type = "image"

      const directoryPath = this.fm.joinPath(this.fm.documentsDirectory(), "CovidZones")
      if (!this.fm.fileExists(directoryPath) || !this.fm.isDirectory(directoryPath)) { this.fm.createDirectory(directoryPath) }
      
      this.fm.writeImage(this.fm.joinPath(directoryPath, this.name + ".jpg"), await Photos.fromLibrary())
      
      background.dark = !(await this.generateAlert("Would you like to use a different image in dark mode?",["Yes","No"]))
      if (background.dark) this.fm.writeImage(this.fm.joinPath(directoryPath, this.name + " (Dark).jpg"), await Photos.fromLibrary())
    }

    this.writePreference(null, background, this.bgPath)
    return this.previewValue() 
  },

  // Load or reload a table full of preferences.
  async loadPrefsTable(table,category) {
    table.removeAllRows()
    for (settingName in category) {
      if (settingName == "name") continue

      const row = new UITableRow()
      row.dismissOnSelect = false
      row.height = 55

      const setting = category[settingName]

      let valText
      if (Array.isArray(setting.val)) {
        valText = setting.val.map(a => a.title).join(", ")
        
      } else if (setting.type == "fonts") {
        const item = setting.val
        const size = item.size.length ? `size ${item.size}` : ""
        const font = item.font.length ? ` ${item.font}` : ""
        const color = item.color.length ? ` (${item.color}${item.dark.length ? "/" + item.dark : ""})` : ""
        const caps = item.caps.length && item.caps != this.enum.caps.none ? ` - ${item.caps}` : ""
        valText = size + font + color + caps

      } else if (typeof setting.val == "object") {
        for (subItem in setting.val) {
          const setupText = subItem + ": " + setting.val[subItem]
          valText = (valText ? valText + ", " : "") + setupText
        }

      } else {
        valText = setting.val + ""
      }

      const cell = row.addText(setting.name,valText)
      cell.subtitleColor = Color.gray()

      // If there's no type, it's just text.
      if (!setting.type) {
        row.onSelect = async () => {
          const returnVal = await this.promptForText(setting.name,[setting.val],[],setting.description)
          setting.val = returnVal.textFieldValue(0).trim()
          await this.loadPrefsTable(table,category)
        }

      } else if (setting.type == "enum") {
        row.onSelect = async () => {
          const returnVal = await this.generateAlert(setting.name,setting.options,setting.description)
          setting.val = setting.options[returnVal]
          await this.loadPrefsTable(table,category)
        }

      } else if (setting.type == "bool") {
        row.onSelect = async () => {
          const returnVal = await this.generateAlert(setting.name,["true","false"],setting.description)
          setting.val = !returnVal
          await this.loadPrefsTable(table,category)
        }

      } else if (setting.type == "fonts") {
        row.onSelect = async () => {
          const keys = ["size","color","dark","font"]
          const values = []
          for (key of keys) values.push(setting.val[key])
          
          const options = ["Capitalization","Save and Close"]
          const prompt = await this.generatePrompt(setting.name,setting.description,options,values,keys)
          const returnVal = await prompt.present()
          
          if (returnVal) {
            for (let i=0; i < keys.length; i++) {
              setting.val[keys[i]] = prompt.textFieldValue(i).trim()
            }
          } else {
            const capOptions = [this.enum.caps.upper,this.enum.caps.lower,this.enum.caps.title,this.enum.caps.none]
            setting.val["caps"] = capOptions[await this.generateAlert("Capitalization",capOptions)]
          }

          await this.loadPrefsTable(table,category)
        }
      
      } else if (setting.type == "multival") {
        row.onSelect = async () => {

          // We need an ordered set.
          const map = new Map(Object.entries(setting.val))
          const keys = Array.from(map.keys())
          const returnVal = await this.promptForText(setting.name,Array.from(map.values()),keys,setting.description)
          for (let i=0; i < keys.length; i++) {
            setting.val[keys[i]] = returnVal.textFieldValue(i).trim()
          }
          await this.loadPrefsTable(table,category)
        }
      
      } else if (setting.type == "multiselect") {
        row.onSelect = async () => {

          // We need to pass sets to the function.
          const options = new Set(setting.options)
          const selected = new Set(setting.val.map ? setting.val.map(a => a.identifier) : [])
          const multiTable = new UITable()
          
          await this.loadMultiTable(multiTable, options, selected)
          await multiTable.present()
          
          setting.val = [...options].filter(option => [...selected].includes(option.identifier))
          await this.loadPrefsTable(table,category)
        }
      }
      table.addRow(row)
    }
    table.reload()
  },
  
  // Load or reload a table with multi-select rows.
  async loadMultiTable(table,options,selected) {
    table.removeAllRows()
    for (const item of options) {
      const row = new UITableRow()
      row.dismissOnSelect = false
      row.height = 55
      
      const isSelected = selected.has(item.identifier)
      row.backgroundColor = isSelected ? Color.dynamic(new Color("d8d8de"), new Color("2c2c2c")) : Color.dynamic(Color.white(), new Color("151517"))
      
      if (item.color) {
        const colorCell = row.addText(isSelected ? "\u25CF" : "\u25CB")
        colorCell.titleColor = item.color
        colorCell.widthWeight = 1
      }
      
      const titleCell = row.addText(item.title)
      titleCell.widthWeight = 15
      
      row.onSelect = async () => {
        if (isSelected) { selected.delete(item.identifier) }
        else { selected.add(item.identifier) }
        await this.loadMultiTable(table,options,selected)
      }
      table.addRow(row)
    }
    table.reload()
  },
  
  // Get the current settings for the widget or for editing.
  async getSettings(forEditing = false) {
    let settingsFromFile  
    if (this.fm.fileExists(this.prefPath)) { settingsFromFile = JSON.parse(this.fm.readString(this.prefPath)) }

    const settingsObject = await this.defaultSettings()
    for (category in settingsObject) {
      for (item in settingsObject[category]) {

        // If the setting exists, use it. Otherwise, the default is used.
        let value = (settingsFromFile && settingsFromFile[category]) ? settingsFromFile[category][item] : undefined
        if (value == undefined) { value = settingsObject[category][item].val }
        
        // Format the object correctly depending on where it will be used.
        if (forEditing) { settingsObject[category][item].val = value }
        else { settingsObject[category][item] = value }
      }
    }
    return settingsObject
  },

  // Edit preferences of the widget.
  async editPreferences() {
    const settingsObject = await this.getSettings(true)
    const table = new UITable()
    table.showSeparators = true

    for (categoryKey in settingsObject) {
      const row = new UITableRow()
      row.dismissOnSelect = false

      const category = settingsObject[categoryKey]
      row.addText(category.name)
      row.onSelect = async () => {
        const subTable = new UITable()
        subTable.showSeparators = true
        await this.loadPrefsTable(subTable,category)
        await subTable.present()
      }
      table.addRow(row)
    }
    await table.present()

    for (categoryKey in settingsObject) {
      for (item in settingsObject[categoryKey]) {
        if (item == "name") continue
        settingsObject[categoryKey][item] = settingsObject[categoryKey][item].val
      }
    }
    this.writePreference(null, settingsObject, this.prefPath)
  },

  // Return the size of the widget preview.
  previewValue() {
    if (this.fm.fileExists(this.prefPath)) {
      const settingsObject = JSON.parse(this.fm.readString(this.prefPath))
      return settingsObject.widget.preview
    } else { return "large" }
  },

  // Download a Scriptable script.
  async downloadCode(filename, url) {
    try {
      const codeString = await new Request(url).loadString()
      if (codeString.indexOf("// Variables used by Scriptable.") < 0) {
        return false
      } else {
        this.fm.writeString(this.fm.joinPath(this.fm.documentsDirectory(), filename + ".js"), codeString)
        return true
      }
    } catch {
      return false
    }
  },

  // Generate an alert with the provided array of options.
  async generateAlert(title,options,message) {
    return await this.generatePrompt(title,message,options)
  },

  // Default prompt for text field values.
  async promptForText(title,values,keys,message) {
    return await this.generatePrompt(title,message,null,values,keys)
  },
  
  // Generic implementation of an alert.
  async generatePrompt(title,message,options,textvals,placeholders) {
    const alert = new Alert()
    alert.title = title
    if (message) alert.message = message
    
    const buttons = options || ["OK"]
    for (button of buttons) { alert.addAction(button) }

    if (!textvals) { return await alert.presentAlert() }

    for (i=0; i < textvals.length; i++) { 
      alert.addTextField(placeholders && placeholders[i] ? placeholders[i] : null,(textvals[i] || "") + "")
    }
    
    if (!options) await alert.present()
    return alert
  },

  // Write the value of a preference to disk.
  writePreference(name, value, inputPath = null) {
    const preference = typeof value == "string" ? value : JSON.stringify(value)
    this.fm.writeString(inputPath || this.fm.joinPath(this.fm.libraryDirectory(), name), preference)
  },
  
/* 
 * Widget spacing, background, and construction
 * -------------------------------------------- */

  // Create and return the widget.
  async createWidget(layout, name, iCloudInUse, custom) {
    if (!this.initialized) this.initialize(name, iCloudInUse)

    // Determine if we're using the old or new setup.
    if (typeof layout == "object") {
      this.settings = layout

    } else {
      this.settings = await this.getSettings()
      this.settings.layout = layout
    }
    
    // Shared values.
    this.locale = this.settings.widget.locale
    this.padding = parseInt(this.settings.widget.padding)
//    this.localization = this.settings.localization
    this.format = this.settings.font
    this.custom = custom
    this.darkMode = !(Color.dynamic(Color.white(),Color.black()).red)

    if (!this.locale || this.locale == "" || this.locale == null) { this.locale = Device.locale() }
    
    // Widget setup.
    this.widget = new ListWidget()
    this.widget.spacing = 0

    const verticalPad = this.padding < 10 ? 10 - this.padding : 10
    const horizontalPad = this.padding < 15 ? 15 - this.padding : 15

    const widgetPad = this.settings.widget.widgetPadding || {}
    const topPad    = (widgetPad.top && widgetPad.top.length) ? parseInt(widgetPad.top) : verticalPad
    const leftPad   = (widgetPad.left && widgetPad.left.length) ? parseInt(widgetPad.left) : horizontalPad
    const bottomPad = (widgetPad.bottom && widgetPad.bottom.length) ? parseInt(widgetPad.bottom) : verticalPad
    const rightPad  = (widgetPad.right && widgetPad.right.length) ? parseInt(widgetPad.right) : horizontalPad
    
    this.widget.setPadding(topPad, leftPad, bottomPad, rightPad)

    // Background setup.
    const background = JSON.parse(this.fm.readString(this.bgPath))

    if (custom && custom.background) {
      await custom.background(this.widget)

    } else if (background.type == "color") {
      this.widget.backgroundColor = this.provideColor(background)

    } else if (background.type == "auto") {
      const gradient = new LinearGradient()
      const gradientSettings = await this.setupGradient()

      gradient.colors = gradientSettings.color()
      gradient.locations = gradientSettings.position()
      this.widget.backgroundGradient = gradient

    } else if (background.type == "gradient") {
      const gradient = new LinearGradient()
      const initialColor = this.provideColor({ color: background.initialColor, dark: background.initialDark })
      const finalColor = this.provideColor({ color: background.finalColor, dark: background.finalDark })

      gradient.colors = [initialColor, finalColor]
      gradient.locations = [0, 1]
      this.widget.backgroundGradient = gradient

    } else if (background.type == "image") {
      const extension = (this.darkMode && background.dark && !this.settings.widget.instantDark ? " (Dark)" : "") + ".jpg"
      const imagePath = this.fm.joinPath(this.fm.joinPath(this.fm.documentsDirectory(), "CovidZones"), name + extension)

      if (this.fm.fileExists(imagePath)) {
        if (this.fm.isFileStoredIniCloud(imagePath)) { await this.fm.downloadFileFromiCloud(imagePath) }
        this.widget.backgroundImage = this.fm.readImage(imagePath)

      } else if (config.runsInWidget) {
        this.widget.backgroundColor = Color.gray() 

      } else {
        this.generateAlert("Please choose a background image in the settings menu.")
      }
    }

    // Construct the widget.
    this.currentRow = {}
    this.currentColumn = {}
    this.left()

    this.usingASCII = undefined
    this.currentColumns = []
    this.rowNeedsSetup = false

    for (rawLine of this.settings.layout.split(/\r?\n/)) { 
      const line = rawLine.trim()
      if (line == '') { continue }
      if (this.usingASCII == undefined) { 
        if (line.includes("row")) { this.usingASCII = false }
        if (line[0] == "-" && line[line.length-1] == "-") { this.usingASCII = true }
      }
      this.usingASCII ? await this.processASCIILine(line) : await this.executeItem(line)
    }
    return this.widget
  },

  // Execute an item in the layout generator.
  async executeItem(item) {
    const itemArray = item.replace(/[.,]$/,"").split('(')
    const functionName = itemArray[0]
    const parameter = itemArray[1] ? itemArray[1].slice(0, -1) : null

    if (this.custom && this.custom[functionName]) { return await this.custom[functionName](this.currentColumn, parameter) }
    if (this[functionName]) { return await this[functionName](this.currentColumn, parameter) }
    console.error("The " + functionName + " item in your layout is unavailable. Check for misspellings or other formatting issues. If you have any custom items, ensure they are set up correctly.")
  },

  // Processes a single line of ASCII. 
  async processASCIILine(line) {

    // If it's a line, enumerate previous columns (if any) and set up the new row.
    if (line[0] == "-" && line[line.length-1] == "-") {
      if (this.currentColumns.length > 0) { 
        for (col of this.currentColumns) {
          if (!col) { continue }
          this.column(this.currentColumn,col.width)
          for (item of col.items) { await this.executeItem(item) }
        }
        this.currentColumns = []
      }
      return this.rowNeedsSetup = true
    }

    if (this.rowNeedsSetup) { 
      this.row(this.currentColumn)
      this.rowNeedsSetup = false 
    }

    const items = line.split('|')
    for (var i=1; i < items.length-1; i++) {

      if (!this.currentColumns[i]) { this.currentColumns[i] = { items: [] } }
      const column = this.currentColumns[i].items

      const rawItem = items[i]
      const trimmedItem = rawItem.trim().split("(")[0]

      // If it's not a widget item, it's a column width or a space.
      if (!(this[trimmedItem] || (this.custom && this.custom[trimmedItem]))) { 

        if (rawItem.match(/\s+\d+\s+/)) {
          const value = parseInt(trimmedItem)
          if (value) { this.currentColumns[i].width = value }
          continue
        }

        const prevItem = column[column.length-1]
        if (trimmedItem == "" && (!prevItem || !prevItem.startsWith("space"))) {
          column.push("space")
          continue
        }
      }

      const leading = rawItem.startsWith(" ")
      const trailing = rawItem.endsWith(" ")
      column.push((leading && trailing) ? "center" : (trailing ? "left" : "right"))
      column.push(rawItem.trim())
    }
  },

  // Makes a new row on the widget.
  row(input, parameter) {
    this.currentRow = this.widget.addStack()
    this.currentRow.layoutHorizontally()
    this.currentRow.setPadding(0, 0, 0, 0)
    this.currentColumn.spacing = 0
    if (parameter) this.currentRow.size = new Size(0,parseInt(parameter))
  },

  // Makes a new column on the widget.
  column(input, parameter) {
    this.currentColumn = this.currentRow.addStack()
    this.currentColumn.layoutVertically()
    this.currentColumn.setPadding(0, 0, 0, 0)
    this.currentColumn.spacing = 0
    if (parameter) this.currentColumn.size = new Size(parseInt(parameter),0)
  },

  // Adds a space, with an optional amount.
  space(input, parameter) { 
    if (parameter) input.addSpacer(parseInt(parameter))
    else input.addSpacer()
  },

  // Create an aligned stack to add content to.
  align(column) {
    const alignmentStack = column.addStack()
    alignmentStack.layoutHorizontally()

    const returnStack = this.currentAlignment(alignmentStack)
    returnStack.layoutVertically()
    return returnStack
  },
  
  // Set the current alignment.
  setAlignment(left = false, right = false) {
    function alignment(alignmentStack) {
      if (right) alignmentStack.addSpacer()
      const returnStack = alignmentStack.addStack()
      if (left) alignmentStack.addSpacer()
      return returnStack
    }
    this.currentAlignment = alignment
  },

  // Change the current alignment to right, left, or center.
  right() { this.setAlignment(false, true) },
  left() { this.setAlignment(true, false) },
  center() { this.setAlignment(true, true) },
  
/* 
 * Data setup functions
 * -------------------------------------------- */

  // Set up the gradient for the widget background.
  async setupGradient() {
    if (!this.data.sun) { await this.setupSunrise() }
    
    if (this.isNight(this.now)) {
      return {
        color() { return [new Color("16296b"), new Color("021033"), new Color("021033"), new Color("113245")] },
        position() { return [-0.5, 0.2, 0.5, 1] },
      }
    }
    return {
      color() { return [new Color("3a8cc1"), new Color("90c0df")] },
      position() { return [0, 1] },
    }
  },

  // Set up the location data object.
  async setupLocation() {
    const locationPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-location")
    const locationCache = this.getCache(locationPath, this.settings ? parseInt(this.settings.widget.updateLocation) : null)
    let location
    
    if (!locationCache || locationCache.cacheExpired) {
      try { location = await Location.current() }
      catch { location = locationCache || { cacheExpired: true } }

      try {
        const geocode = await Location.reverseGeocode(location.latitude, location.longitude, this.locale)
        location.locality = (geocode[0].locality || geocode[0].postalAddress.city) || geocode[0].administrativeArea
      } catch {
        location.locality = locationCache ? locationCache.locality : null
      }
      
      // If (and only if) we have new data, write it to disk.
      if (!location.cacheExpired) this.fm.writeString(locationPath, JSON.stringify(location))
    }
    this.data.location = location || locationCache
    if (!this.data.location.latitude) return false
    return true
  },
  
  // Set up the sun data object.
  async setupSunrise() {
    if (!this.data.location) { await this.setupLocation() }
    const location = this.data.location
    async function getSunData(date) { return await new Request("https://api.sunrise-sunset.org/json?lat=" + location.latitude + "&lng=" + location.longitude + "&formatted=0&date=" + date.getFullYear() + "-" + (date.getMonth()+1) + "-" + date.getDate()).loadJSON() }

    const sunPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-sunrise")
    let sunData = this.getCache(sunPath, 60, 1440)

    if (!sunData || sunData.cacheExpired || !sunData.results || sunData.results.length == 0) { 
      try {
        sunData = await getSunData(this.now)

        const tomorrowDate = new Date()
        tomorrowDate.setDate(this.now.getDate() + 1)
        const tomorrowData = await getSunData(tomorrowDate)
        sunData.results.tomorrow = tomorrowData.results.sunrise

        this.fm.writeString(sunPath, JSON.stringify(sunData))
      } catch {}
    }
    this.data.sun = {}
    this.data.sun.sunrise = sunData ? new Date(sunData.results.sunrise).getTime() : null
    this.data.sun.sunset = sunData ? new Date(sunData.results.sunset).getTime() : null
    this.data.sun.tomorrow = sunData ? new Date(sunData.results.tomorrow).getTime() : null
  },
  
// Set up the COVID data object.
    async setupCovid(strProv) {
    const covidPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-covid")
    let covidData = this.getCache(covidPath, -1, 60)

//    if (!covidData || covidData.cacheExpired) {
      try {
		  
		  https://services9.arcgis.com/pJENMVYPQqZZe20v/arcgis/rest/services/Health_Regional_Archive_(Public_View)/FeatureServer/0/query?where=Province%20%3D%20'NB'&outFields=*&returnGeometry=false&outSR=4326&f=json
		  
        covidData = await new Request("https://services9.arcgis.com/pJENMVYPQqZZe20v/arcgis/rest/services/Health_Regional_Archive_(Public_View)/FeatureServer/0/query?where=Province%20%3D%20'" + strProv + "'&outFields=*&returnGeometry=false&outSR=4326&f=json").loadJSON()
        this.fm.writeString(covidPath, JSON.stringify(covidData))
      } catch {}
//    }
    this.data.covid = covidData || {}
  },
  
/* 
 * Widget items
 * -------------------------------------------- */

  // Display the date on the widget.
  async date(column) {
    const dateSettings = this.settings.date
//    const u = this.data.covid.features[0].attributes.Last_Updated
//    const du = new Date(u)
		
    if (!this.data.events && dateSettings.dynamicDateSize) { await this.setupEvents() }

    if (dateSettings.dynamicDateSize ? this.data.events.length : dateSettings.staticDateSize == "small") {
      this.provideText(this.formatDate(this.now,dateSettings.smallDateFormat), column, this.format.smallDate, true)

    } else {
      const dateOneStack = this.align(column)
      const dateOne = this.provideText(this.formatDate(this.now,dateSettings.largeDateLineOne), dateOneStack, this.format.largeDate1)
      dateOneStack.setPadding(this.padding/2, this.padding, 0, this.padding)
//      const dateOne = this.provideText(du.toUTCString(), dateOneStack, this.format.largeDate1)
//      dateOneStack.setPadding(this.padding/2, this.padding, 0, this.padding)

//      const dateTwoStack = this.align(column)
//      const dateTwo = this.provideText(this.formatDate(this.now,dateSettings.largeDateLineTwo), dateTwoStack, this.format.largeDate2)
//      dateTwoStack.setPadding(0, this.padding, this.padding, this.padding)
//      const dateTwoStack = this.align(column)
//      const dateTwo = this.provideText(this.settings.covid.Province.trim(), dateTwoStack, this.format.greeting)
//      dateTwoStack.setPadding(0, this.padding, this.padding, this.padding)
    }
  },

  // Display COVID info on the widget.
  async covid(column) {
    if (!this.data.covid) { await this.setupCovid(this.settings.covid.Province.trim()) }

	
    const dateSettings = this.settings.date
    var u 
    var du
    var dateOne
    var dateOneStack
	var StrZone = this.settings.covid.Zone.trim()

	var i

	u = this.data.covid.features[StrZone].attributes.Last_Updated
	du = new Date(u)
	
    covidStack_nb = this.align(column)
    covidStack_nb.setPadding(this.padding/2, this.padding, this.padding/2, this.padding)
    covidStack_nb.layoutHorizontally()
    covidStack_nb.centerAlignContent()
    covidStack_nb.url = this.settings.covid.url

    covidStack_nb.addSpacer(this.padding * 0.3)

    covidStack_nb.addSpacer(this.padding)
	
	var StrCovidData = this.settings.covid.covidtext.trim()
	
	this.provideText("Covid-19 Stats - " + this.data.covid.features[StrZone].attributes.ENGNAME.substring(7,25), column, this.format.greeting)
	this.provideText("Last Updated: " + this.customDateToString(du)+"\n", column, this.format.greeting)
	
    this.provideText("Active Cases:"+(this.data.covid.features[StrZone].attributes.CurrentCaseCount-this.data.covid.features[StrZone].attributes.CurrentRecovered)+", "+StrCovidData.replace(/{(.*?)}/g, (match, $1) => {
      let val = this.data.covid.features[StrZone].attributes[$1]
      if (val) val = new Intl.NumberFormat(this.locale.replace('_','-')).format(val)
      return val || ""})+", Population:" + new Intl.NumberFormat(this.locale.replace('_','-')).format(this.data.covid.features[StrZone].attributes.TotalPop2019) + ", Infected/K:" + new Intl.NumberFormat(this.locale.replace('_','-')).format(((this.data.covid.features[StrZone].attributes.CurrentCaseCount/(this.data.covid.features[StrZone].attributes.TotalPop2019/1000)))), column, this.format.covid)
  }
	,
  

/* 
 * Helper functions
 * -------------------------------------------- */

  // Gets the cache.
  getCache(path, minAge = -1, maxAge) {
    if (!this.fm.fileExists(path)) return null
    const cache = JSON.parse(this.fm.readString(path))
    const age = (this.now.getTime() - this.fm.modificationDate(path).getTime())/60000
    
    // Maximum ages must be explicitly defined.
    if (Number.isInteger(maxAge) && age > maxAge) return null
    
    // The cache is always expired if there's no acceptable minimum age.
    if (minAge != -1 && (!minAge || age > minAge)) cache.cacheExpired = true
    return cache
  },
  
  customDateToString(d) {
		strHour = this.addZero(d.getHours())
		strMin = this.addZero(d.getMinutes())
        return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${strHour}:${strMin}`;
  },

  addZero(i) {
	if (i < 10) {
		i = "0" + i
	}
  return i
  },
  
  // Returns a rounded number string or the provided dummy text.
  displayNumber(number,dummy = "-") { return (number == null ? dummy : Math.round(number).toString()) },

  // Tints icons if needed or forced.
  tintIcon(icon,format,force = false) {
    const tintIcons = this.settings.widget.tintIcons
    const never = tintIcons == this.enum.icons.never || !tintIcons
    const notDark = tintIcons == this.enum.icons.dark && !this.darkMode && !this.settings.widget.instantDark
    const notLight = tintIcons == this.enum.icons.light && this.darkMode && !this.settings.widget.instantDark
    if (!force && (never || notDark || notLight)) { return }
    icon.tintColor = this.provideColor(format)
  },

  // Determines if the provided date is at night.
  isNight(dateInput) {
    const timeValue = dateInput.getTime()
    return (timeValue < this.data.sun.sunrise) || (timeValue > this.data.sun.sunset)
  },
  
  // Returns the difference in days between two dates. Adapted from StackOverflow.
  dateDiff(first, second) {
    const firstDate = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0)
    const secondDate = new Date(second.getFullYear(), second.getMonth(), second.getDate(), 0, 0, 0)
    return Math.round((secondDate-firstDate)/(1000*60*60*24))
  },

  // Convenience functions for dates and times.
  formatTime(date) { return this.formatDate(date,null,false,true) },
  formatDatetime(date) { return this.formatDate(date,null,true,true) },
  
  // Format the date. If no format is provided, date-only is used by default.
  formatDate(date,format,showDate = true, showTime = false) {
    const df = new DateFormatter()
    df.locale = this.locale
    if (format) {
      df.dateFormat = format
    } else {
      showDate ? df.useShortDateStyle() : df.useNoDateStyle()
      showTime ? df.useShortTimeStyle() : df.useNoTimeStyle()
    }
    return df.string(date)
  },

  // Provide a text symbol with the specified shape.
  provideTextSymbol(shape) {
    if (shape.startsWith("rect")) { return "\u2759" }
    if (shape == "circle") { return "\u2B24" }
    return "\u2759" 
  },

  // Provide a font based on the input.
  provideFont(fontName, fontSize) {
    const fontGenerator = {
      ultralight() { return Font.ultraLightSystemFont(fontSize) },
      light()      { return Font.lightSystemFont(fontSize) },
      regular()    { return Font.regularSystemFont(fontSize) },
      medium()     { return Font.mediumSystemFont(fontSize) },
      semibold()   { return Font.semiboldSystemFont(fontSize) },
      bold()       { return Font.boldSystemFont(fontSize) },
      heavy()      { return Font.heavySystemFont(fontSize) },
      black()      { return Font.blackSystemFont(fontSize) },
      italic()     { return Font.italicSystemFont(fontSize) },
    }
    return fontGenerator[fontName] ? fontGenerator[fontName]() : new Font(fontName, fontSize)
  },

  // Add formatted text to a container.
  provideText(string, stack, format, standardize = false) {
    let container = stack
    if (standardize) {
      container = this.align(stack)
      container.setPadding(this.padding, this.padding, this.padding, this.padding)
    }
    
    const capsEnum = this.enum.caps
    function capitalize(text,caps) {
      switch (caps) {
        case (capsEnum.upper):
          return text.toUpperCase()
        
        case (capsEnum.lower):
          return text.toLowerCase()
        
        case (capsEnum.title):
          return text.replace(/\w\S*/g,function(a) {
            return a.charAt(0).toUpperCase() + a.substr(1).toLowerCase()
          })
      }
      return text
    }
    
    const capFormat = (format && format.caps && format.caps.length) ? format.caps : this.format.defaultText.caps
    const textItem = container.addText(capitalize(string,capFormat))
    
    const textFont = (format && format.font && format.font.length) ? format.font : this.format.defaultText.font
    const textSize = (format && format.size && parseInt(format.size)) ? format.size : this.format.defaultText.size
    textItem.font = this.provideFont(textFont, parseInt(textSize))
    textItem.textColor = this.provideColor(format)

    return textItem
  },
  
  // Provide a color based on a format and the current dark mode state.
  provideColor(format, alpha) {
    const defaultText = this.format.defaultText
    const lightColor = (format && format.color && format.color.length) ? format.color : defaultText.color
    const defaultDark = (defaultText.dark && defaultText.dark.length) ? defaultText.dark : defaultText.color
    const darkColor = (format && format.dark && format.dark.length) ? format.dark : defaultDark

    if (this.settings.widget.instantDark) return Color.dynamic(new Color(lightColor, alpha), new Color(darkColor, alpha))
    return new Color(this.darkMode && darkColor ? darkColor : lightColor, alpha)
  },

  // Draw the vertical line in the tomorrow view. - TODO: delete
  drawVerticalLine(color, height) {

    const width = 2

    let draw = new DrawContext()
    draw.opaque = false
    draw.respectScreenScale = true
    draw.size = new Size(width,height)

    let barPath = new Path()
    const barHeight = height
    barPath.addRoundedRect(new Rect(0, 0, width, height), width/2, width/2)
    draw.addPath(barPath)
    draw.setFillColor(color)
    draw.fillPath()

    return draw.getImage()
  },

   // Return the default widget settings.
  async defaultSettings() {
    const settings = {
      widget: {
        name: "Overall settings",
        locale: {
          val: "",
          name: "Locale code",
          description: "Leave blank to match the device's locale.",
        },
        units: {
          val: "metric",
          name: "Units",
          description: "Use imperial for Fahrenheit or metric for Celsius.",
          type: "enum",
          options: ["imperial","metric"],
        },
        preview: {
          val: "large",
          name: "Widget preview size",
          description: "Set the size of the widget preview displayed in the app.",
          type: "enum",
          options: ["small","medium","large"],
        },
        padding: {
          val: "5",
          name: "Item padding",
          description: "The padding around each item. This also determines the approximate widget padding. Default is 5.",
        },
        widgetPadding: {
          val: { top: "", left: "", bottom: "", right: "" },
          name: "Custom widget padding",
          type: "multival",
          description: "The padding around the entire widget. By default, these values are blank and CovidZones uses the item padding to determine these values. Transparent widgets often look best with these values at 0.",
        },
        tintIcons: {
          val: this.enum.icons.never,
          name: "Icons match text color",
          description: "Decide when icons should match the color of the text around them.",
          type: "enum",
          options: [this.enum.icons.never,this.enum.icons.always,this.enum.icons.dark,this.enum.icons.light,],
        },
        updateLocation: {
          val: "60",
          name: "Location update frequency",
          description: "How often, in minutes, to update the current location. Set to 0 to constantly update, or -1 to never update.",
        },
        instantDark: {
          val: false,
          name: "Instant dark mode (experimental)",
          type: "bool",
          description: "Instantly switch to dark mode. \u26A0\uFE0F This DOES NOT support dark mode image backgrounds or custom icon tint settings. \u26A0\uFE0F",
        },
      },
	  font: {
        name: "Text sizes, colors, and fonts",
        defaultText: {
          val: { size: "14", color: "ffffff", dark: "", font: "regular", caps: "" },
          name: "Default font settings",
          description: "These settings apply to all text on the widget that doesn't have a customized value.",
          type: "fonts",
        },
        greeting:    {
          val: { size: "18", color: "1aff05", dark: "1aff05", font: "semibold", caps: "" },
          name: "Greeting",
          type: "fonts",
        },
        customText:  {
          val: { size: "14", color: "", dark: "", font: "", caps: "" },
          name: "User-defined text items",
          type: "fonts",
        },
        covid:       {
          val: { size: "15", color: "1aff05", dark: "1aff05", font: "medium", caps: "" },
          name: "COVID data",
          type: "fonts",
        },
      },
      date: {
        name: "Date",
        dynamicDateSize: {
          val: true,
          name: "Dynamic date size",
          description: "If set to true, the date will become smaller when events are displayed.",
          type: "bool",
        },
        staticDateSize: {
          val: "small",
          name: "Static date size",
          description: "Set the date size shown when dynamic date size is not enabled.",
          type: "enum",
          options: ["small","large"],
        },
        smallDateFormat: {
          val: "EEEE, MMMM d",
          name: "Small date format",
        },
        largeDateLineOne: {
          val: "EEEE,",
          name: "Large date format, line 1",
        }, 
        largeDateLineTwo: {
          val: "MMMM d",
          name: "Large date format, line 2",
        }, 
      },
      covid: {
        name: "COVID data",
        Province: {
          val: "NB",
          name: "Province for COVID information",
        }, 
		Zone: {
          val: "1",
          name: "Zone for COVID information",
        },        
        covidtext: {
          val: "Cases:{CurrentCaseCount}, Deaths:{CurrentDeaths}, Recoveries:{CurrentRecovered}, Tests:{CurrentTests}",
          name: "COVID data text",
          description: "Each {token} is replaced with the number from the data. The available tokens are: cases, todayCases, deaths, todayDeaths, recovered, active, critical, casesPerOneMillion, deathsPerOneMillion, totalTests, testsPerOneMillion"
        },		
		url: {
          val: "https://covid19.who.int",
          name: "URL to open when the COVID data is tapped",
        }, 
      },
      symbol: {
        name: "Symbols",
        size: {
          val: "18",
          name: "Size",
          description: "Size of each symbol. Leave blank to fill the width of the column.",
        }, 
        padding: {
          val: { top: "", left: "", bottom: "", right: "" },
          name: "Padding",
          type: "multival",
          description: "The padding around each symbol. Leave blank to use the default padding.",
        },
        tintColor: {
          val: "ffffff",
          name: "Tint color",
          description: "The hex code color value to tint the symbols. Leave blank for the default tint.",
        }, 
      },
    }
    
    async function getFromCalendar(forReminders) {
      try { return await forReminders ? Calendar.forReminders() : Calendar.forEvents() }
      catch { return [] }
    }

    return settings
  },
  
  enum: {
    caps: {
      upper: "ALL CAPS",
      lower: "all lowercase",
      title: "Title Case",
      none: "None (Default)",
    },
    icons: {
      never: "Never",
      always: "Always",
      dark: "In dark mode",
      light: "In light mode",
    }
  },
}

module.exports = CovidZones

/*
 * Detect the current module
 * by Raymond Velasquez @supermamon
 * -------------------------------------------- */
 
const moduleName = module.filename.match(/[^\/]+$/)[0].replace(".js","")
if (moduleName == Script.name()) {
  await (async () => {
    // Comment out the return to run a test.
    return
    const layout = `
    row
      column
    `
    const name = "CovidZones Widget Builder"
    await CovidZones.runSetup(name, true, "CovidZones code", https://raw.githubusercontent.com/miltjef/CovidZones/main/CovidCasesByZoneCode.js")
    const w = await CovidZones.createWidget(layout, name, true)
    w.presentLarge()
    Script.complete()
  })() 
}

/* 
 * Don't modify the characters below this line.
 * -------------------------------------------- */
//4
