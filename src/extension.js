const vscode = require('vscode');
const si = require('systeminformation');
const path = require('path');

// Status bar items for each metric
let responseTimeItem;
let cpuUsageItem;
let memoryUsageItem;
let diskUsageItem;

// Update interval in milliseconds
const UPDATE_INTERVAL = 2000;

// Store the last response time
let lastResponseTime = 0;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('System Information extension is now active');

    // Create status bar items
    responseTimeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    responseTimeItem.command = 'vscode-sysinfo.showDetails';
    responseTimeItem.tooltip = 'Response Time';
    
    cpuUsageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    cpuUsageItem.command = 'vscode-sysinfo.showDetails';
    cpuUsageItem.tooltip = 'CPU Usage';
    
    memoryUsageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    memoryUsageItem.command = 'vscode-sysinfo.showDetails';
    memoryUsageItem.tooltip = 'Memory Usage';
    
    diskUsageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    diskUsageItem.command = 'vscode-sysinfo.showDetails';
    diskUsageItem.tooltip = 'Disk Usage';

    // Show all status bar items
    responseTimeItem.show();
    cpuUsageItem.show();
    memoryUsageItem.show();
    diskUsageItem.show();

    // Register command to show detailed information
    let disposable = vscode.commands.registerCommand('vscode-sysinfo.showDetails', async () => {
        try {
            const [cpu, mem, disk, osInfo, cpuTemp] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.osInfo(),
                si.cpuTemperature()
            ]);

            // Format detailed information
            const detailedInfo = formatDetailedInfo(cpu, mem, disk, osInfo, cpuTemp);
            
            // Show information in a message box
            vscode.window.showInformationMessage('System Information', {
                detail: detailedInfo,
                modal: true
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching system information: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(responseTimeItem);
    context.subscriptions.push(cpuUsageItem);
    context.subscriptions.push(memoryUsageItem);
    context.subscriptions.push(diskUsageItem);

    // Start updating the status bar
    updateStatusBar();
    setInterval(updateStatusBar, UPDATE_INTERVAL);
}

/**
 * Format detailed system information for display
 */
function formatDetailedInfo(cpu, mem, disk, osInfo, cpuTemp) {
    const cpuInfo = `CPU: ${cpu.currentLoad.toFixed(1)}% (Avg: ${cpu.avgLoad.toFixed(1)}%)
Cores: ${cpu.cpus.length}
User: ${cpu.currentLoadUser.toFixed(1)}%
System: ${cpu.currentLoadSystem.toFixed(1)}%
Temperature: ${cpuTemp.main ? cpuTemp.main.toFixed(1) + '°C' : 'N/A'}`;

    const memInfo = `Memory Usage: ${formatBytes(mem.used)} / ${formatBytes(mem.total)} (${(mem.used / mem.total * 100).toFixed(1)}%)
Active: ${formatBytes(mem.active)}
Available: ${formatBytes(mem.available)}
Free: ${formatBytes(mem.free)}
Cached: ${formatBytes(mem.cached || 0)}
Buffers: ${formatBytes(mem.buffers || 0)}
Swap Used: ${formatBytes(mem.swapused)} / ${formatBytes(mem.swaptotal)} (${mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal * 100).toFixed(1) : 0}%)`;

    // Get the main disk (usually the first one)
    const mainDisk = disk[0] || {};
    const diskInfo = `Disk: ${(mainDisk.used / 1024 / 1024 / 1024).toFixed(2)}GB / ${(mainDisk.size / 1024 / 1024 / 1024).toFixed(2)}GB (${mainDisk.use ? mainDisk.use.toFixed(1) : 0}%)
Mount: ${mainDisk.mount || 'N/A'}
FS: ${mainDisk.fs || 'N/A'}`;

    const osInfoText = `OS: ${osInfo.platform} ${osInfo.distro} ${osInfo.release}
Kernel: ${osInfo.kernel}
Arch: ${osInfo.arch}
Hostname: ${osInfo.hostname}`;

    const responseInfo = `Response Time: ${lastResponseTime.toFixed(2)}ms`;

    return `${responseInfo}\n\n${cpuInfo}\n\n${memInfo}\n\n${diskInfo}\n\n${osInfoText}`;
}

/**
 * Update the status bar with system information
 */
async function updateStatusBar() {
    try {
        // Measure response time
        const startTime = performance.now();
        await si.time();
        const endTime = performance.now();
        lastResponseTime = endTime - startTime;

        // Get system information
        const [cpu, mem, disk] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize()
        ]);

        // Update status bar items
        responseTimeItem.text = `$(clock) ${lastResponseTime.toFixed(2)}ms`;
        
        // 更新CPU信息，添加更详细的提示
        const cpuPercentage = cpu.currentLoad.toFixed(1);
        cpuUsageItem.text = `$(pulse) ${cpuPercentage}%`;
        cpuUsageItem.tooltip = `CPU使用率: ${cpuPercentage}%
用户占用: ${cpu.currentLoadUser.toFixed(1)}%
系统占用: ${cpu.currentLoadSystem.toFixed(1)}%
平均负载: ${cpu.avgLoad.toFixed(2)}
点击查看更多详情`;
        
        // 更新内存信息，添加更详细的提示
        const memPercentage = (mem.used / mem.total * 100).toFixed(1);
        memoryUsageItem.text = `$(database) ${memPercentage}%`;
        memoryUsageItem.tooltip = `内存使用率: ${memPercentage}%
总内存: ${formatBytes(mem.total)}
已使用: ${formatBytes(mem.used)}
可用: ${formatBytes(mem.available)}
点击查看更多详情`;
        
        // Get the main disk (usually the first one)
        const mainDisk = disk[0] || {};
        const diskPercentage = mainDisk.use ? mainDisk.use.toFixed(1) : 0;
        diskUsageItem.text = `$(device-harddisk) ${diskPercentage}%`;
        diskUsageItem.tooltip = `磁盘使用率: ${diskPercentage}%
总容量: ${formatBytes(mainDisk.size)}
已使用: ${formatBytes(mainDisk.used)}
可用: ${formatBytes(mainDisk.size - mainDisk.used)}
挂载点: ${mainDisk.mount || 'N/A'}
点击查看更多详情`;
    } catch (error) {
        console.error('Error updating status bar:', error);
        
        // Show error in status bar
        responseTimeItem.text = '$(error) Error';
        cpuUsageItem.text = '$(error) Error';
        memoryUsageItem.text = '$(error) Error';
        diskUsageItem.text = '$(error) Error';
    }
}

/**
 * Deactivate the extension
 */
function deactivate() {
    // Clean up resources
    if (responseTimeItem) responseTimeItem.dispose();
    if (cpuUsageItem) cpuUsageItem.dispose();
    if (memoryUsageItem) memoryUsageItem.dispose();
    if (diskUsageItem) diskUsageItem.dispose();
}

// 格式化字节数为可读格式
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
    activate,
    deactivate
}; 