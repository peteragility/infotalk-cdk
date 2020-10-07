package com.myorg;

import software.amazon.awscdk.core.App;

public final class InfotalkCdkApp {
    public static void main(final String[] args) {
        App app = new App();

        new InfotalkCdkStack(app, "InfotalkCdkStack");

        app.synth();
    }
}
