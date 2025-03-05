import * as vscode from 'vscode';
import * as si from 'systeminformation';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

// Status bar items for each metric
let responseTimeItem: vscode.StatusBarItem;
let cpuUsageItem: vscode.StatusBarItem;
let memoryUsageItem: vscode.StatusBarItem;
let diskUsageItem: vscode.StatusBarItem;

// Update interval in milliseconds
const UPDATE_INTERVAL: number = 2000;

// Store the last response time
let lastResponseTime: number = 0;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext): void {
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
            vscode.window.showErrorMessage(`Error fetching system information: ${error instanceof Error ? error.message : String(error)}`);
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

    // 检查是否在远程环境中
    const isRemote = vscode.env.remoteName !== undefined;
    
    if (isRemote) {
        // 获取远程类型
        const remoteType = vscode.env.remoteName;
        console.log(`Running in remote environment: ${remoteType}`);
        
        // 初始测量
        measureRemoteLatency();
        
        // 定期更新 (每30秒)
        const latencyInterval = setInterval(() => measureRemoteLatency(), 30000);
        context.subscriptions.push({ dispose: () => clearInterval(latencyInterval) });
    } else {
        // 本地环境，隐藏响应时间项
        responseTimeItem.hide();
    }
}

/**
 * Format detailed system information for display
 */
function formatDetailedInfo(
    cpu: si.Systeminformation.CurrentLoadData, 
    mem: si.Systeminformation.MemData, 
    disk: si.Systeminformation.FsSizeData[], 
    osInfo: si.Systeminformation.OsData, 
    cpuTemp: si.Systeminformation.CpuTemperatureData
): string {
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
    const mainDisk = disk[0] || {
        fs: 'N/A',
        type: 'N/A',
        size: 0,
        used: 0,
        available: 0,
        use: 0,
        mount: 'N/A',
        rw: true
    } as si.Systeminformation.FsSizeData;
    
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
async function updateStatusBar(): Promise<void> {
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
        responseTimeItem.text = `$(cloud-upload) ${lastResponseTime.toFixed(2)}ms`;

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
        memoryUsageItem.text = `$(server) ${memPercentage}%`;
        memoryUsageItem.tooltip = `内存使用率: ${memPercentage}%
总内存: ${formatBytes(mem.total)}
已使用: ${formatBytes(mem.used)}
可用: ${formatBytes(mem.available)}
点击查看更多详情`;

        // Get the main disk (usually the first one)
        const mainDisk = disk[0] || {
            fs: 'N/A',
            type: 'N/A',
            size: 0,
            used: 0,
            available: 0,
            use: 0,
            mount: 'N/A',
            rw: true
        } as si.Systeminformation.FsSizeData;
        
        const diskPercentage = mainDisk.use ? mainDisk.use.toFixed(1) : '0';
        diskUsageItem.text = `$(database) ${diskPercentage}%`;
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

// 测量远程连接延迟的综合方法
async function measureRemoteLatency(): Promise<number | null> {
    try {
        const startTime = performance.now();
        
        // 执行一系列远程操作
        await Promise.all([
            vscode.workspace.fs.stat(vscode.Uri.file('/')),
            new Promise(resolve => setTimeout(resolve, 10)), // 小延迟确保操作分开
            vscode.workspace.fs.stat(vscode.Uri.file('/'))
        ]);
        
        const endTime = performance.now();
        const latency = (endTime - startTime) / 2; // 平均两次操作的时间
        
        console.log(`Remote connection latency: ${latency.toFixed(2)}ms`);
        
        // 更新状态栏
        responseTimeItem.text = `$(broadcast) ${latency.toFixed(2)}ms`;
        responseTimeItem.tooltip = `远程连接响应时间: ${latency.toFixed(2)}ms
远程类型: ${vscode.env.remoteName}
点击查看更多系统信息`;
        
        // 更新全局变量以便在详细信息中使用
        lastResponseTime = latency;
        
        return latency;
    } catch (error) {
        console.error('Error measuring remote latency:', error);
        responseTimeItem.text = `$(warning) --ms`;
        responseTimeItem.tooltip = `无法测量远程连接响应时间`;
        return null;
    }
}

// 使用系统 ping 命令测量网络延迟
async function pingNetwork(): Promise<void> {
    try {
        // 获取远程主机名 (这可能需要根据您的设置调整)
        let hostname = 'localhost';
        
        if (vscode.env.remoteName === 'ssh') {
            // 尝试从 SSH 配置中提取主机名
            // 这是一个简化的示例，实际实现可能更复杂
            const config = vscode.workspace.getConfiguration('remote.SSH');
            const host = config.get<string>('defaultHost');
            if (host) {
                hostname = host;
            }
        }
        
        // 执行 ping 命令 (Windows 和 Unix 系统的命令不同)
        const isWindows = process.platform === 'win32';
        const pingCommand = isWindows 
            ? `ping -n 4 ${hostname}`
            : `ping -c 4 ${hostname}`;
        
        const { stdout } = await execPromise(pingCommand);
        
        // 解析 ping 输出以提取平均延迟
        // 注意: 这个正则表达式可能需要根据不同操作系统的输出格式调整
        const match = /Average = (\d+)ms|avg = (\d+\.\d+)\/(\d+\.\d+)\/(\d+\.\d+)/i.exec(stdout);
        
        if (match) {
            // 提取平均延迟值
            const latency = match[1] || match[3] || '0';
            console.log(`Network ping latency: ${latency}ms`);
            
            // 更新状态栏
            responseTimeItem.text = `$(broadcast) ${latency}ms`;
            responseTimeItem.tooltip = `网络延迟 (ping): ${latency}ms
目标主机: ${hostname}
点击查看更多系统信息`;
        }
    } catch (error) {
        console.error('Error executing ping command:', error);
    }
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
    // Clean up resources
    if (responseTimeItem) responseTimeItem.dispose();
    if (cpuUsageItem) cpuUsageItem.dispose();
    if (memoryUsageItem) memoryUsageItem.dispose();
    if (diskUsageItem) diskUsageItem.dispose();
}

// 格式化字节数为可读格式
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 