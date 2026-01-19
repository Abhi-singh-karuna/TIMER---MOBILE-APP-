const { withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const withTimerModule = (config) => {
    return withXcodeProject(config, (config) => {
        const xcodeProject = config.modResults;
        const groupName = 'TIMERAPP';
        const projectRoot = config.modRequest.projectRoot;

        // Files to copy and their source directories
        const filesToCopy = [
            { name: 'TimerModule.swift', srcDir: 'modules/timer-module/ios' },
            { name: 'TimerModule.m', srcDir: 'modules/timer-module/ios' },
            { name: 'TimerAttributes.swift', srcDir: 'targets/timer-live-activity' }
        ];

        filesToCopy.forEach(file => {
            const srcPath = path.join(projectRoot, file.srcDir, file.name);
            const destPath = path.join(projectRoot, 'ios', groupName, file.name);

            // Copy the file to the ios directory
            if (fs.existsSync(srcPath)) {
                if (!fs.existsSync(path.dirname(destPath))) {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                }
                fs.copyFileSync(srcPath, destPath);
            }

            // Add file to the project
            if (!xcodeProject.hasFile(file.name)) {
                xcodeProject.addSourceFile(
                    path.join(groupName, file.name),
                    null,
                    xcodeProject.findPBXGroupKey({ name: groupName })
                );
            }
        });

        return config;
    });
};

module.exports = withTimerModule;
