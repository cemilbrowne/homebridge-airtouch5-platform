
# AirTouch 5 Homebridge support
This plugin is designed to support an AirTouch 5 system.  It works for me with multiple AirTouch systems.

## Background

  

AirTouch 5 system required - from https://www.airtouch.net.au/smart-air-conditioning/airtouch-5/
  

## Device setup

  
I've tested this on my config - I have 2 separate AirTouch 5 systems, each with 1 AC.  One has 4 zones, the other has 3.  Auto discover works well.

I'd recommend that you make sure you're setup correctly on the Airtouch.  Go in to installer settings, check that you have the right number of zones setup, check that you have zone names, etc.  I also suggest auto on/off, but not required. 

  

## Limitations

  
* AirTouch 5 supports dry/fan modes.  This plugin doesn't, because I can't figure out how Homekit would.  
  

## Installation
It should be as easy as finding *homebridge-airtouch5-platform* and installing.  The config file should just be as simple as:

    {
	    "name":  "AirTouch5",
	    "platform":  "Airtouch5",  
    }

## More config
The only additional config is setting unit IPs manually:

    {
	    "name":  "AirTouch5",
	    "platform":  "Airtouch5",  
	    "units":  [
		    "192.168.8.86",
		    "192.168.8.96"
	    ]
    }

  

