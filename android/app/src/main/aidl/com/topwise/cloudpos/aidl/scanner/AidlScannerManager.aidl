package com.topwise.cloudpos.aidl.scanner;

import com.topwise.cloudpos.aidl.scanner.AidlScannerListener;

/**
 * Manager do leitor de código-de-barras.
 * Métodos mínimos exigidos pelo ScannerPlugin.java
 */
interface AidlScannerManager {
    void init();                       // inicializa o módulo
    void exit();                       // finaliza / libera recursos
    void decode(in AidlScannerListener listener); // dispara leitura assíncrona
}
