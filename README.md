# webcomponents-cli
A CLI to convert [**WaveMaker**](https://www.wavemakeronline.com/) Prefabs to [**WebComponents**](https://www.webcomponents.org/)

## Usage

The CLI requires & prompts the user for WaveMaker Prefab project path(Exported from WaveMaker).

The CLI can take them as paramaters,
* `-s | --prefab-project-path`

### **npx**
The CLI can be invoked directly without installation using `npx` &
will ensure it executes the latest version available.
```
npx @wavemaker/webcomponents-cli -s /path/to/prefab/project
```

# Web Component Usage Guide

## Accessing Properties, Methods, and Events

All properties, methods, and events are attached to the web component's DOM element. To interact with the component, you must first select the element in the DOM.
const webcomponent = .querySelector(‘webcomp-tagname’);

### Accessing Properties
You can retrieve or modify properties using:
```
webcomponent.propname;
```

### Calling Methods
Invoke methods using:
```
webcomponent.methodname();
```

### Listening to Events
To handle events, use the standard addEventListener method:
```
webcomponent.addEventListener('eventname', callBackMethod);
```

### Ensuring Web Component Initialization
The web component may not be ready immediately. To ensure you access properties and methods only after initialization, listen for the 'init' event:
```
webcomponent.addEventListener('init', () => {
   console.log('Web component initialized');
});
```
This ensures that your interactions with the web component happen at the right time.