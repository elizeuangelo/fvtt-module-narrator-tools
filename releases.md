# Patch Notes

## 0.59

-   Chat commands now respect newlines properly
-   Update to korean translation

## 0.58

-   The scenery button now resides on the controls layer side and no longer is using the ui controls app

## 0.57

-   Full compatibility with 0.8.6
-   Added permission settings

## 0.56

-   Improved (again) the text selection tool, fixing some bugs
-   Custom Font configuration now loads fonts directly from a Web or local File Path, instead of using the Google Fonts api

## 0.55

-   Added context-menu support for any `.editor-content`
-   Improved visuals for WRFP4
-   Fixed a bug where break-line would not be respected
-   Selection tool for the context-menu remade

## 0.54

-   Improved visuals for WRFP4
-   Added new configuration for controlling the messages types
-   Attempt on fixing some compatibility errors with other modules

## 0.53

-   Corrected bug where some characters might disappear depending on the system's CSS

## 0.52

-   Fixed visibility-related bug to the buttons bar (again)
-   Changed the message type, from `OTHERS` to `IC`

## 0.51

-   Fixed visibility-related bug to the buttons bar
-   `_character` attribute is now public, changed to `character` and added to the wiki

## 0.50

-   A background image or video can now be added to the scenery background (works best with transparency)
-   The background color of narrations and scenery can now be altered
-   Narrations are now saved to the DB, this means narrations now persist without a present GM
-   Added buttons for GM to pause and play narrations
-   Added new settings to control the funcionalities above
-   Changed the CSS style to be more system agnostic
-   Added new `/not(e/ification/ify)` chat command, as an universal way to display GM-only visible notes to chat. This was added primarly to enhance other modules/macros funcionality
-   Added new `/as [speaker]` chat command, for the DM to send messages as any speaker without the need to create tokens/actors
