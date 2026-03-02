import React, {createContext, useContext, useEffect, useState} from "react";
import {apiClient} from "@/services/api";
import {getAppVersion} from "@/constants/version";

interface VersionCheckContextType {
	isVersionSupported: boolean;
	isChecking: boolean;
	versionInfo: {
		currentVersion: string;
		latestVersion: string;
		message: string;
	} | null;
}

const VersionCheckContext = createContext<VersionCheckContextType>({
	isVersionSupported: true,
	isChecking: true,
	versionInfo: null,
});

export const useVersionCheck = () => {
	const context = useContext(VersionCheckContext);
	if (!context) {
		throw new Error("useVersionCheck must be used within a VersionCheckProvider");
	}
	return context;
};

interface VersionCheckProviderProps {
	children: React.ReactNode;
}

export const VersionCheckProvider: React.FC<VersionCheckProviderProps> = ({children}) => {
	const [isVersionSupported, setIsVersionSupported] = useState(true);
	const [isChecking, setIsChecking] = useState(true);
	const [versionInfo, setVersionInfo] = useState<{
		currentVersion: string;
		latestVersion: string;
		message: string;
	} | null>(null);

	useEffect(() => {
		const checkVersion = async () => {
			try {
				setIsChecking(true);
				const currentVersion = getAppVersion();
				console.log("🔍 Starting version check for version:", currentVersion);
				const response = await apiClient.checkVersion(currentVersion);

				console.log("📡 Version check response:", JSON.stringify(response, null, 2));

				setVersionInfo({
					currentVersion,
					latestVersion: response.latest_version,
					message: response.message,
				});

				console.log("🚦 Is version supported?", response.is_supported);
				if (!response.is_supported) {
					console.log("❌ App version not supported - should block app:", response);
					setIsVersionSupported(false);
					// Let the index.tsx handle the navigation
				} else {
					console.log("✅ App version supported:", response);
					setIsVersionSupported(true);
				}
			} catch (error) {
				console.error("Version check failed:", error);
				// In case of error, assume version is supported to not block the app
				setIsVersionSupported(true);
			} finally {
				setIsChecking(false);
			}
		};

		checkVersion();
	}, []);

	const value: VersionCheckContextType = {
		isVersionSupported,
		isChecking,
		versionInfo,
	};

	return <VersionCheckContext.Provider value={value}>{children}</VersionCheckContext.Provider>;
};
