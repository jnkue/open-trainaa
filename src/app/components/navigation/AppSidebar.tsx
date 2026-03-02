import React, { useState, useEffect } from "react";
import { View, Dimensions } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import ChatInterface from "../ChatInterface";

interface AppSidebarProps {
  userId: string;
  accessToken: string;
}

export function AppSidebar({ userId, accessToken }: AppSidebarProps) {
  const [screenWidth, setScreenWidth] = useState(Dimensions.get("window").width);
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const [initialWidth, setInitialWidth] = useState(0);

  useEffect(() => {
    const updateLayout = () => {
      const window = Dimensions.get("window");
      setScreenWidth(window.width);
      // Set sidebar width to 1/3 of window width initially
      if (sidebarWidth === 0) {
        setSidebarWidth(Math.round(window.width / 3));
      }
    };

    const subscription = Dimensions.addEventListener("change", updateLayout);
    
    // Initial setup
    updateLayout();

    return () => subscription?.remove();
  }, [sidebarWidth]);

  // Handle pan gesture events for resizing
  const handlePanGesture = (event: any) => {
    const { nativeEvent } = event;

    // Only handle during ACTIVE state
    if (nativeEvent.state === State.ACTIVE) {
      const deltaX = nativeEvent.translationX;
      // Min width 200, max width screen - 200
      const newWidth = Math.max(200, Math.min(screenWidth - 200, initialWidth + deltaX));
      setSidebarWidth(newWidth);
    }
  };

  // Handle pan gesture state changes
  const handlePanStateChange = (event: any) => {
    const { nativeEvent } = event;
    if (nativeEvent.state === State.BEGAN) {
      setInitialWidth(sidebarWidth);
    }
  };

  return (
    <>
      <View style={{ width: sidebarWidth }} className="border-r border-border bg-card">
        <ChatInterface userId={userId} accessToken={accessToken} />
      </View>
      {/* Resizable divider */}
      <PanGestureHandler onGestureEvent={handlePanGesture} onHandlerStateChange={handlePanStateChange}>
        <View style={{ width: 8 }} className="bg-muted justify-center items-center border-l border-r border-border cursor-col-resize">
          <View className="w-1 h-15 bg-muted-foreground rounded-sm" />
        </View>
      </PanGestureHandler>
    </>
  );
}
